package main

import (
	"fmt"
	"os"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")
	fmt.Println("ELBER_EMAIL_PROVIDER =", os.Getenv("ELBER_EMAIL_PROVIDER"))
	fmt.Println("ELBER_RESEND_FROM_EMAIL =", os.Getenv("ELBER_RESEND_FROM_EMAIL"))
	fmt.Println("ELBER_RESEND_API_KEY length =", len(os.Getenv("ELBER_RESEND_API_KEY")))
}
