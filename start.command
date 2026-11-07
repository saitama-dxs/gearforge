#!/bin/sh
# GearForge 起動スクリプト（macOS）。Finder でダブルクリックすると端末が開いて起動する。初回は右クリック →「開く」。
cd "$(dirname "$0")" && exec sh ./start.sh "$@"
