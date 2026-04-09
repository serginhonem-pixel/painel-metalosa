const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const buildNotification = (osId, after, eventLabel) => {
  const ativo = after.ativo || 'Ativo nao informado';
  const setor = after.setor || 'Sem setor';
  const prioridade = after.prioridade || 'Sem prioridade';
  const responsavel = after.responsavel || 'Nao atribuido';
  const title = `OS ${osId} - ${eventLabel}`;
  const contestacao = String(after.ultimaContestacao?.motivo || '').trim();
  const contestacaoResumo = contestacao
    ? ` · Contestacao: ${contestacao.slice(0, 120)}`
    : '';
  const body = `${ativo} · ${setor} · ${prioridade} · Resp: ${responsavel}${contestacaoResumo}`;
  return { title, body };
};

const getEventLabel = (before, after) => {
  if (!before) return 'Abriu';
  const beforeStatus = String(before.status || '').toLowerCase();
  const afterStatus = String(after.status || '').toLowerCase();
  if (beforeStatus === afterStatus) return null;
  if (beforeStatus === 'finalizada' && afterStatus !== 'finalizada') return 'Reabriu';
  if (afterStatus === 'em andamento' && after.responsavel) return 'Assumiu';
  if (afterStatus === 'contestada') return 'Contestou';
  if (afterStatus === 'finalizada') return 'Finalizou';
  return `Status: ${after.status || 'Atualizado'}`;
};

exports.notifyOnOsStatusChange = onDocumentWritten(
  'manutencao_os/{osId}',
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after) return;

    const eventLabel = getEventLabel(before, after);
    if (!eventLabel) return;

    const tokenSnap = await db
      .collection('notification_tokens')
      .where('enabled', '==', true)
      .get();
    if (tokenSnap.empty) return;

    const tokens = tokenSnap.docs.map((doc) => doc.id);
    const { title, body } = buildNotification(event.params.osId, after, eventLabel);
    const payload = {
      notification: { title, body },
      data: {
        osId: event.params.osId,
        status: String(after.status || ''),
        link: '/',
      },
    };

    const tokenChunks = chunkArray(tokens, 500);
    for (const chunk of tokenChunks) {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        ...payload,
      });

      const removals = [];
      response.responses.forEach((result, index) => {
        if (!result.error) return;
        const code = result.error.code || '';
        if (code === 'messaging/registration-token-not-registered') {
          const token = chunk[index];
          removals.push(db.collection('notification_tokens').doc(token).delete());
        }
      });
      if (removals.length) {
        await Promise.allSettled(removals);
      }
    }
  }
);
