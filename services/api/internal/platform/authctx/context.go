package authctx

import "context"

type userKey struct{}
type orgKey struct{}

func WithUser(ctx context.Context, userID string) context.Context {
    return context.WithValue(ctx, userKey{}, userID)
}

func WithOrganisation(ctx context.Context, orgID string) context.Context {
    return context.WithValue(ctx, orgKey{}, orgID)
}

func UserFromContext(ctx context.Context) string {
    id, _ := ctx.Value(userKey{}).(string)
    return id
}

func OrgFromContext(ctx context.Context) string {
    id, _ := ctx.Value(orgKey{}).(string)
    return id
}































// // Package authctx holds the typed context keys for the authenticated
// // user and active organisation. Every package that needs to read these
// // from a request context imports this package rather than defining its
// // own keys (which would silently fail to match).
// //
// // The OrganisationContext middleware sets these values. Handlers read
// // them. No other code should write to these keys.

// package authctx

// import "context"

// type userKey struct{}
// type orgKey struct{}

// // WithUser returns a context carrying the authenticated user ID.
// // Called by the OrganisationContext middleware.
// func WithUser(ctx context.Context, userID string) context.Context {
// 	return context.WithValue(ctx, userKey{}, userID)
// }

// // WithOrganisation returns a context carrying the active organisation ID.
// // Called by the OrganisationContext middleware.
// func WithOrganisation(ctx context.Context, orgID string) context.Context {
// 	return context.WithValue(ctx, orgKey{}, orgID)
// }

// // UserFromContext returns the authenticated user ID, or "" if absent.
// func UserFromContext(ctx context.Context) string {
// 	id, _ := ctx.Value(userKey{}).(string)
// 	return id
// }

// // OrgFromContext returns the active  organisation ID, or "" if absent.
// func OrgFromContext(ctx context.Context) string {
// 	id, ctx.Value(orgKey{}).(string)
// 	return id
// }