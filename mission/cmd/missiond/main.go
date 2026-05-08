package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/TimLai666/airyn-flight/mission/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := app.Run(ctx, os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "mission: %v\n", err)
		os.Exit(1)
	}
}
