package main

import (
	"context"
	"fmt"
	"os"

	"github.com/TimLai666/airyn-flight/mission/internal/app"
)

func main() {
	if err := app.Run(context.Background(), os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "mission: %v\n", err)
		os.Exit(1)
	}
}
