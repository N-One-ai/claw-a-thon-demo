#!/bin/bash

cd agent/agent
python3 -m src.main --serve --port 8080 &

cd ../web
npm run dev