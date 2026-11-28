// Guarda em memória as mensagens que o bot enviou, para o Baileys as poder reenviar quando o
// telemóvel de quem recebe não as consegue decifrar e pede de novo ("A aguardar pela mensagem").
// Sem isto o getMessage devolve sempre vazio e a mensagem fica presa para sempre.
const MAX = 5000
const VALIDADE_MS = 24 * 60 * 60 * 1000
const guardadas = new Map() // id -> { message, em }

function guardar(res) {
  const id = res?.key?.id
  if (!id || !res?.message) return
  guardadas.set(id, { message: res.message, em: Date.now() })
  if (guardadas.size > MAX) {
    const it = guardadas.keys()
    for (let i = 0; i < 1000; i++) guardadas.delete(it.next().value)
  }
}

async function getMessage(key) {
  const item = key?.id ? guardadas.get(key.id) : null
  if (!item) return undefined
  if (Date.now() - item.em > VALIDADE_MS) {
    guardadas.delete(key.id)
    return undefined
  }
  return item.message
}

// Envolve o sendMessage do socket para guardar cada mensagem enviada.
function registarSocket(sock) {
  if (!sock || sock.__mensagensEnviadas) return sock
  const original = sock.sendMessage.bind(sock)
  sock.sendMessage = async (...args) => {
    const res = await original(...args)
    try { guardar(res) } catch {}
    return res
  }
  sock.__mensagensEnviadas = true
  return sock
}

module.exports = { guardar, getMessage, registarSocket, _guardadas: guardadas }
