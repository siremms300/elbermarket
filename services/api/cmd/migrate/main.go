package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/elbermarket/api/internal/platform/config"
)

// The migrate binary is a thin wrapper around goose. It exists so that
// migrations run through the same configuration loader as the API and
// can be invoked consistently in local development and CI.
func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: migrate <up|down|status|create> [args]")
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config load failed: %v", err)
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database open failed: %v", err)
	}
	defer db.Close()

	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("goose dialect failed: %v", err)
	}

	command := os.Args[1]
	args := os.Args[2:]

	migrationsDir := "db/migrations"

	switch command {
	case "up":
		err = goose.Up(db, migrationsDir)
	case "down":
		err = goose.Down(db, migrationsDir)
	case "status":
		err = goose.Status(db, migrationsDir)
	case "create":
		if len(args) < 1 {
			log.Fatal("usage: migrate create <name>")
		}
		err = goose.Create(db, migrationsDir, args[0], "sql")
	default:
		log.Fatalf("unknown command: %s", command)
	}

	if err != nil {
		log.Fatalf("migration %s failed: %v", command, err)
	}

	fmt.Printf("migration %s completed\n", command)
}