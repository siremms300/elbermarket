// Cloudflare R2 storage adapter. Uses AWS SDK v2 (S3-compatible).

package documents

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type R2Store struct {
	client   *s3.Client
	presign  *s3.PresignClient
	bucket   string
}

func NewR2Store(accountID, accessKey, secretKey, bucket string) (*R2Store, error) {
	if accountID == "" || accessKey == "" || secretKey == "" || bucket == "" {
		return nil, fmt.Errorf("R2 credentials incomplete: accountID, accessKey, secretKey, bucket required")
	}

	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	return &R2Store{
		client:  client,
		presign: s3.NewPresignClient(client),
		bucket:  bucket,
	}, nil
}

func (s *R2Store) GenerateUploadURL(ctx context.Context, storageKey, contentType string, ttl time.Duration) (*UploadTarget, error) {
	req, err := s.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(storageKey),
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return nil, fmt.Errorf("presign upload: %w", err)
	}

	return &UploadTarget{
		URL:    req.URL,
		Method: req.Method,
		Headers: map[string]string{
			"Content-Type": contentType,
		},
	}, nil
}

func (s *R2Store) GenerateDownloadURL(ctx context.Context, storageKey string, ttl time.Duration) (string, error) {
	req, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(storageKey),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("presign download: %w", err)
	}
	return req.URL, nil
}

func (s *R2Store) Delete(ctx context.Context, storageKey string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(storageKey),
	})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}

func (s *R2Store) HealthCheck(ctx context.Context) error {
	// Use ListObjectsV2 with MaxKeys=1 instead of HeadBucket. R2's HeadBucket
	// requires s3:ListAllMyBuckets even when the token is correctly scoped
	// to the target bucket. ListObjectsV2 exercises the same read access
	// the app actually uses, without the extra permission requirement.
	_, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(s.bucket),
		MaxKeys: aws.Int32(1),
	})
	if err != nil {
		return fmt.Errorf("health check (list objects): %w", err)
	}
	return nil
}