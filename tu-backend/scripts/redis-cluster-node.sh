#!/bin/sh
set -e

announce_ip="$(grep -m1 'host\.docker\.internal' /etc/hosts | awk '{print $1}')"
if [ -z "$announce_ip" ]; then
  echo "failed to resolve host.docker.internal from /etc/hosts" >&2
  exit 1
fi

exec redis-server \
  --port 6379 \
  --cluster-enabled yes \
  --cluster-config-file nodes.conf \
  --cluster-node-timeout 5000 \
  --appendonly yes \
  --bind 0.0.0.0 \
  --protected-mode no \
  --cluster-announce-ip "$announce_ip" \
  --cluster-announce-port "${REDIS_ANNOUNCE_PORT:?REDIS_ANNOUNCE_PORT is required}" \
  --cluster-announce-bus-port "${REDIS_ANNOUNCE_BUS_PORT:?REDIS_ANNOUNCE_BUS_PORT is required}"
