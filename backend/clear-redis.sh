#!/bin/bash
# Clear Redis Cache Helper Script

echo "=========================================="
echo "🧹 Clearing Redis Cache..."
echo "=========================================="

# Flush all Redis data
docker exec vercelplay-redis redis-cli FLUSHALL

echo ""
echo "✅ Redis cache cleared!"
echo ""
echo "Checking Redis status..."
docker exec vercelplay-redis redis-cli INFO stats | grep -E "(total_commands_processed|instantaneous_ops_per_sec)"
docker exec vercelplay-redis redis-cli DBSIZE | xargs -I{} echo "Total keys: {}"
echo ""
echo "=========================================="
echo "✨ Done!"
echo "=========================================="
