@echo off
setlocal
cd /d c:\Users\coordpcp\painel-industrial
set FATURAMENTO_CSV=\\10.10.100.4\Setor\PCP\ARQIMPORT\met113l.csv
set FATURAMENTO_CSV_ENCODING=latin1
set FATURAMENTO_WATCH_MS=30000
set FATURAMENTO_AUTO_GIT=1
set FATURAMENTO_GIT_PUSH=1
set FATURAMENTO_GIT_MESSAGE=chore: atualizar faturamento
"C:\Program Files\nodejs\node.exe" "scripts\watchFaturamentoCsv.mjs"
