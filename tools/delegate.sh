#!/bin/bash
# Dispatch one coding task to a LOCAL Qwen model through opencode.
#   tools/delegate.sh <strata|q27> <brief.md> <task-id> [timeout-seconds]
# Refuses to run unless the chosen local endpoint is healthy. There is no
# fallback: opencode.json in this directory enables only the two local
# providers, so a hosted model cannot be reached from here.
set -u
cd "$(dirname "$0")/.." || exit 1
ALIAS="${1:?model alias}"; BRIEF="${2:?brief file}"; ID="${3:?task id}"; TMO="${4:-1500}"
case "$ALIAS" in
  strata) MODEL=strata/qwen3.8-flash-next-iq2_xs-agent; URL=http://127.0.0.1:8090 ;;
  q27)    MODEL=llamacpp/qwen3.8-27b;                   URL=http://127.0.0.1:8081 ;;
  *) echo "delegate: unknown model alias $ALIAS" >&2; exit 2 ;;
esac
[ -f "$BRIEF" ] || { echo "delegate: no brief $BRIEF" >&2; exit 2; }
curl -sf --max-time 3 "$URL/health" >/dev/null || { echo "delegate: $ALIAS endpoint $URL is DOWN -- not falling back, aborting." >&2; exit 3; }
SERVED=$(curl -sf --max-time 3 "$URL/v1/models" | head -c 300)
mkdir -p .agent-logs
STAMP=$(date +%Y%m%d-%H%M%S); LOG=".agent-logs/$STAMP-$ID-$ALIAS"
START=$(date +%s)
timeout "$TMO" opencode run --auto --archived -m "$MODEL" --format json --title "$ID" \
  "$(cat "$BRIEF")" > "$LOG.jsonl" 2> "$LOG.err"
RC=$?
END=$(date +%s)
python3 - "$LOG.jsonl" > "$LOG.report.txt" <<'PY'
import json,sys
text=[];tools=0;tok_in=tok_out=0
for line in open(sys.argv[1]):
    try: e=json.loads(line)
    except Exception: continue
    p=e.get('part',{})
    if e.get('type')=='tool_use': tools+=1
    if e.get('type')=='text': text.append(p.get('text',''))
    if e.get('type')=='step_finish':
        t=p.get('tokens',{}); tok_out+=t.get('output',0)+t.get('reasoning',0); tok_in=max(tok_in,t.get('input',0)+t.get('cache',{}).get('read',0))
print(f"tool_calls={tools} peak_context={tok_in} generated_tokens={tok_out}")
print("---- final message ----")
print(text[-1] if text else "(no text)")
PY
{ echo "task=$ID model=$MODEL endpoint=$URL rc=$RC wall=$((END-START))s"; echo "served_by=$SERVED"; cat "$LOG.report.txt"; } | tee "$LOG.summary.txt"
exit $RC
