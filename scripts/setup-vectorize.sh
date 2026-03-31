#!/bin/bash
echo "Creating Vectorize index..."
npx wrangler vectorize create missiai-life-graph \
  --dimensions=768 \
  --metric=cosine
echo "Done. Add LIFE_GRAPH binding to wrangler.toml"
