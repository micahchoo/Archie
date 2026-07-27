#!/bin/bash
pass=0; fail=0
for i in $(seq 1 20); do
  if node recipes/smoke.mjs > /tmp/stab-$i.log 2>&1; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    echo "RUN $i FAILED:"; grep -E "^  FAIL" /tmp/stab-$i.log
  fi
  echo "run $i: $(grep -oE 'hard assertions *: [0-9]+/[0-9]+' /tmp/stab-$i.log)"
done
echo "STABILITY: $pass green / $fail red out of 20"
