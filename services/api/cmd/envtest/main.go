package main

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	// Mimic exactly what the config loader does
	err1 := godotenv.Load()
	fmt.Println("godotenv.Load() error:", err1)

	err2 := godotenv.Load("../../.env")
	fmt.Println("godotenv.Load(../../.env) error:", err2)

	fmt.Println("ELBER_EMAIL_PROVIDER =", os.Getenv("ELBER_EMAIL_PROVIDER"))
	fmt.Println("ELBER_RESEND_FROM_EMAIL =", os.Getenv("ELBER_RESEND_FROM_EMAIL"))
	fmt.Println("ELBER_RESEND_API_KEY length =", len(os.Getenv("ELBER_RESEND_API_KEY")))
}
