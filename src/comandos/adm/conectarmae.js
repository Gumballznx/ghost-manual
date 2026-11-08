const path = require('path')
const config = require('../../../data/config.json')
const { isLeaderCheck, isSubdonoCheck } = require('../../utils/baileys')
const subbotManager = require('../../bot/subbotManager')

/**
 * Comando para Conectar ou Reconectar a Conexão Principal (Mãe) via WhatsApp remoto!
 * Apenas Dono Supremo ou Subdonos autorizados podem executar.
 * Permite reerguer a sessão principal (.session) gerando Pairing Code ou QR Code
 * disparado de qualquer sub-bot ativo ou do próprio terminal/WhatsApp.
 */
async function handleConectarMae(sock, msg, from, sender, text) {
  const prefix = config.prefix || '.'
  const trimmed = (text || '').trim()
  if (!trimmed.startsWith(prefix) && !trimmed.startsWith('!')) return false

  const parts = trimmed.slice(trimmed.startsWith(prefix) ? prefix.length : 1).trim().split(/\s+/)
  const rawCmd = (parts[0] || '').toLowerCase()

  const isMaePair = rawCmd === 'conectarmae' ||
                    rawCmd === 'conectarprincipal' ||
                    rawCmd === 'reconectarmae' ||
                    rawCmd === 'reconectarprincipal' ||
                    rawCmd === 'pairmae' ||
                    rawCmd === 'pairprincipal'

  const isMaeQr = rawCmd === 'qrmae' ||
                  rawCmd === 'qrprincipal' ||
                  rawCmd === 'reconectarqrmae'

  if (!isMaePair && !isMaeQr) {
    return false
  }

  // Trava de Segurança Máxima: Somente Dono ou Subdono
  const isOwnerOrSubdono = isLeaderCheck(sender, msg) || isSubdonoCheck(sender)
  if (!isOwnerOrSubdono) {
    await sock.sendMessage(from, {
      text: [
        '╭┈⊰ 👻 『 *ACESSO EXCLUSIVO: DONO / SUBDONO* 』',
        '┊',
        '┊•.̇𖥨֗⛔⭟ *Ação Bloqueada!*',
        '┊•.̇𖥨֗🔒⭟ Apenas o Dono ou Subdono podem reconectar a Conexão Principal (Mãe).',
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
      ].join('\n')
    }, { quoted: msg })
    return true
  }

  // Se a mãe já está online
  if (global.primaryConnected && global.primarySocket) {
    await sock.sendMessage(from, {
      text: [
        '╭┈⊰ 👻 『 *CONEXÃO PRINCIPAL JÁ ONLINE* 』',
        '┊',
        '┊•.̇𖥨֗🟢⭟ A Conexão Principal (Mãe) já está ativa e operando normalmente.',
        '┊•.̇𖥨֗ℹ️⭟ Não é necessário reconectar no momento.',
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
      ].join('\n')
    }, { quoted: msg })
    return true
  }

  const isGroup = from.endsWith('@g.us')

  // MODO QR CODE
  if (isMaeQr) {
    let placeholderMsg = null
    let lastQrKey = null

    try {
      placeholderMsg = await sock.sendMessage(from, {
        text: [
          '╭┈⊰ 👻 『 *RECONECTANDO CONEXÃO PRINCIPAL (MÃE)* 』',
          '┊',
          '┊•.̇𖥨֗📸⭟ *Modo:* QR Code (Imagem)',
          '┊•.̇𖥨֗⏳⭟ Gerando imagem do QR Code para a sessão principal...',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')
      }, { quoted: msg })
    } catch {}

    try {
      await subbotManager.conectarMae({
        method: 'qr',
        onQrCode: async (qrBuffer, rawQr, attempt, maxAttempts) => {
          if (placeholderMsg?.key) {
            try { await sock.sendMessage(from, { delete: placeholderMsg.key }) } catch {}
            placeholderMsg = null
          }
          if (lastQrKey) {
            try { await sock.sendMessage(from, { delete: lastQrKey }) } catch {}
            lastQrKey = null
          }

          try {
            const sent = await sock.sendMessage(from, {
              image: qrBuffer,
              caption: [
                '╭┈⊰ 👻 『 *QR CODE: CONEXÃO PRINCIPAL (MÃE)* 』',
                '┊',
                `┊•.̇𖥨֗🔄⭟ *Tentativa:* ${attempt}/${maxAttempts}`,
                '┊•.̇𖥨֗⏱️⭟ O código expira a cada 20-30 segundos.',
                '┊',
                '┊•.̇𖥨֗📸⭟ *Como conectar:*',
                '┊  1. Abra o WhatsApp no chip principal do bot.',
                '┊  2. Toque nos 3 pontinhos > *Aparelhos Conectados*.',
                '┊  3. Toque em *Conectar um aparelho*.',
                '┊  4. Aponte a câmera para este QR Code.',
                '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
              ].join('\n')
            })
            if (sent?.key) lastQrKey = sent.key
          } catch (errSend) {
            console.error('[CONECTAR-MAE] Erro ao enviar imagem de QR:', errSend.message)
          }
        },
        onConnected: async (num) => {
          if (lastQrKey) {
            try { await sock.sendMessage(from, { delete: lastQrKey }) } catch {}
            lastQrKey = null
          }
          await sock.sendMessage(from, {
            text: [
              '╭┈⊰ 👻 『 *CONEXÃO PRINCIPAL RESTAURADA* 』',
              '┊',
              `┊•.̇𖥨֗👑⭟ *Bot Mãe Conectado:* +${num || 'Ativo'}`,
              '┊•.̇𖥨֗🟢⭟ *Status:* ONLINE',
              '┊•.̇𖥨֗✨⭟ A rede Ghost está operando com potência máxima!',
              '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
            ].join('\n')
          })
        },
        onError: async (err) => {
          if (lastQrKey) {
            try { await sock.sendMessage(from, { delete: lastQrKey }) } catch {}
            lastQrKey = null
          }
          await sock.sendMessage(from, {
            text: `❌ *Erro ao parear Conexão Principal via QR:* ${err.message}`
          }, { quoted: msg })
        }
      })
    } catch (err) {
      if (placeholderMsg?.key) {
        try { await sock.sendMessage(from, { delete: placeholderMsg.key }) } catch {}
      }
      await sock.sendMessage(from, {
        text: `❌ *Falha ao iniciar processo QR da Conexão Principal:* ${err.message}`
      }, { quoted: msg })
    }
    return true
  }

  // MODO PAIRING CODE (CÓDIGO DE 8 DÍGITOS)
  const rawTarget = parts[1] || config.botNumber || ''
  const cleanNumber = String(rawTarget).replace(/\D/g, '')

  if (!cleanNumber || cleanNumber.length < 8) {
    await sock.sendMessage(from, {
      text: [
        '╭┈⊰ 👻 『 *RECONEXÃO PRINCIPAL: NÚMERO NECESSÁRIO* 』',
        '┊',
        '┊•.̇𖥨֗📱⭟ *Uso correto:*',
        `┊   \`${prefix}conectarmae 25887xxxxxxx\``,
        '┊',
        '┊•.̇𖥨֗💡⭟ Ou se preferir usar QR Code:',
        `┊   \`${prefix}qrmae\``,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
      ].join('\n')
    }, { quoted: msg })
    return true
  }

  await sock.sendMessage(from, {
    text: `⏳ *Iniciando conexão da CONEXÃO PRINCIPAL (MÃE) para +${cleanNumber}...*\n\nGerando código de pareamento de 8 dígitos, aguarde...`
  }, { quoted: msg })

  try {
    let codigoEnviado = false
    await subbotManager.conectarMae({
      numero: cleanNumber,
      method: 'code',
      onPairingCode: async (formattedCode, rawCode) => {
        if (codigoEnviado) return
        codigoEnviado = true

        const card = [
          '╭┈⊰ 👻 『 *CONEXÃO PRINCIPAL: CÓDIGO DE PAREAMENTO* 』',
          '┊',
          `┊•.̇𖥨֗📱⭟ *Número Alvo (Mãe):* +${cleanNumber}`,
          '┊•.̇𖥨֗🔑⭟ *Código de Conexão:*',
          '┊',
          `┊     👉 *${formattedCode}* 👈`,
          '┊',
          '┊•.̇𖥨֗📋⭟ *Passo a passo no WhatsApp:*',
          '┊  1. Abra o WhatsApp no chip principal.',
          '┊  2. Vá em Aparelhos Conectados > Conectar um aparelho.',
          '┊  3. Selecione "Conectar com número de telefone".',
          '┊  4. Digite o código de 8 dígitos acima.',
          '┊',
          '┊•.̇𖥨֗⏱️⭟ O código expira em aproximadamente 60 segundos.',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')

        try {
          await sock.sendMessage(from, { text: card }, { quoted: msg })
          // Envia o código limpo avulso para facilitar cópia
          await sock.sendMessage(from, { text: `${rawCode || formattedCode.replace(/-/g, '')}` })
        } catch (e) {
          console.error('[CONECTAR-MAE] Erro ao enviar código:', e.message)
        }
      },
      onConnected: async (num) => {
        await sock.sendMessage(from, {
          text: [
            '╭┈⊰ 👻 『 *CONEXÃO PRINCIPAL RESTAURADA* 』',
            '┊',
            `┊•.̇𖥨֗👑⭟ *Bot Mãe Conectado:* +${num || cleanNumber}`,
            '┊•.̇𖥨֗🟢⭟ *Status:* ONLINE',
            '┊•.̇ função⭟ A rede Ghost está operando com potência máxima!',
            '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
          ].join('\n')
        })
      },
      onError: async (err) => {
        await sock.sendMessage(from, {
          text: `❌ *Erro ao conectar Conexão Principal:* ${err.message}`
        }, { quoted: msg })
      }
    })
  } catch (err) {
    await sock.sendMessage(from, {
      text: `❌ *Erro ao iniciar processo da Conexão Principal:* ${err.message}`
    }, { quoted: msg })
  }

  return true
}

handleConectarMae.nome = 'conectarmae'
handleConectarMae.aliases = [
  'conectarprincipal',
  'reconectarmae',
  'reconectarprincipal',
  'pairmae',
  'pairprincipal',
  'qrmae',
  'qrprincipal',
  'reconectarqrmae'
]
handleConectarMae.categoria = 'adm'
handleConectarMae.descricao = 'Reconecta a Conexão Principal (Mãe) via WhatsApp sem precisar de terminal'
handleConectarMae.uso = '.conectarmae <numero> ou .qrmae'
handleConectarMae.execute = handleConectarMae

module.exports = handleConectarMae
