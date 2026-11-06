#!/bin/sh
set -eu

exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb/pb_migrations
