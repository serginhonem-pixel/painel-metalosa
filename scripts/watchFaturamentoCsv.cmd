@echo off
setlocal
cd /d c:\Users\coordpcp\painel-industrial
set FATURAMENTO_CSV=G:\.shortcut-targets-by-id\1TyTzui--9Dzn32hfPiGA00Gk0DsXcP5i\PCP\ARQIMPORT\met113l.csv
set FATURAMENTO_CSV_ENCODING=latin1
set FATURAMENTO_WATCH_MS=30000
set FATURAMENTO_AUTO_GIT=1
set FATURAMENTO_GIT_PUSH=1
set FATURAMENTO_GIT_MESSAGE=chore: atualizar faturamento
set FATURAMENTO_GIT_BIN=C:\Program Files\Git\cmd\git.exe
"C:\Program Files\nodejs\node.exe" "scripts\watchFaturamentoCsv.mjs"
