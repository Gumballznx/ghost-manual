const configManager = require('../utils/configManager')
const { bemvindoStore } = require('../utils/firebaseDataLayer')

function getDataMocambique() {
  const now = new Date()
  const offset = 2 * 60
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
  return new Date(utc + (offset * 60000))
}

function grupoAutorizado(groupId) {
  const groups = configManager.loadGroupConfig()
  const grupoInfo = configManager.getGroupEntry(groupId, groups)

  if (!grupoInfo?.authorized) return false

  if (grupoInfo.expiraEm) {
    const agora = getDataMocambique().getTime()
    if (agora >= grupoInfo.expiraEm) return false
  }

  return true
}

function extrairJidParticipante(participant) {
  if (typeof participant === 'string') return participant
  if (participant && typeof participant === 'object') {
    return participant.id || participant.jid || participant.phoneNumber || ''
  }
  return ''
}

module.exports = async (sock, update) => {
  if (update?.participants && update.action === 'add') {
    const groupId = update.id
    if (!groupId) return

    if (!grupoAutorizado(groupId)) return

    const groups = configManager.loadGroupConfig()
    const grupoCfg = configManager.getGroupEntry(groupId, groups)

    const bemvindoConfig = bemvindoStore.loadSync() || {}
    const dotJid = groupId.replace(/\./g, '___dot___')
    const bvStatus = bemvindoConfig[groupId] !== undefined ? bemvindoConfig[groupId] : bemvindoConfig[dotJid]

    if (grupoCfg.bemvindo === false || bvStatus === false) {
      return
    }

    const isOn = bvStatus === true || grupoCfg.boasVindas === true || grupoCfg.bemvindo === true

    if (isOn) {
      const botNum = sock?.user?.id ? sock.user.id.split(':')[0].split('@')[0].replace(/\D/g, '') : ''
      const botLid = sock?.user?.lid ? sock.user.lid.split(':')[0].split('@')[0].replace(/\D/g, '') : ''
      const participants = (Array.isArray(update.participants) ? update.participants : [])
        .map(extrairJidParticipante)
        .filter(jid => {
          if (!jid) return false
          const clean = jid.split('@')[0].split(':')[0].replace(/\D/g, '')
          if (botNum && clean === botNum) return false
          if (botLid && clean === botLid) return false
          return true
        })

      if (participants.length === 0) return

      try {
        const mencoesTexto = participants.map(p => `@${p.split('@')[0].split(':')[0]}`).join(', ')

        const texto = [
          `${mencoesTexto}`,
          '╭┈⊰ 🎉 『 *SEJA BEM-VINDO(A)* 』',
          '┊Olá, seja muito bem-vindo(a) ao grupo!',
          '┊',
          '┊📖 *Para consultar os preços:*',
          '┊•.̇𖥨֗👻⭟ Digite: *tabela*',
          '┊',
          '┊💳 *Para formas de pagamento:*',
          '┊•.̇𖥨֗👻⭟ Digite: *pagamento*',
          '┊',
          '┊📌 *Sinta-se à vontade para perguntar!*',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')

        let profilePic = null
        try {
          if (participants.length === 1) {
            try {
              profilePic = await sock.profilePictureUrl(participants[0], 'image')
            } catch {
              profilePic = null
            }
          }

          if (!profilePic) {
            try {
              profilePic = await sock.profilePictureUrl(groupId, 'image')
            } catch {
              profilePic = null
            }
          }
        } catch { }

        if (profilePic) {
          try {
            await sock.sendMessage(groupId, {
              image: { url: profilePic },
              caption: texto,
              mentions: participants
            })
          } catch (imgErr) {
            console.warn(`[BEMVINDO] Falha ao enviar imagem no grupo ${groupId}, enviando só texto:`, imgErr.message)
            await sock.sendMessage(groupId, {
              text: texto,
              mentions: participants
            })
          }
        } else {
          await sock.sendMessage(groupId, {
            text: texto,
            mentions: participants
          })
        }
        console.log(`[BEMVINDO] Mensagem enviada com sucesso no grupo ${groupId}`)
      } catch (err) {
        console.error("[BEMVINDO] Erro ao enviar boas-vindas:", err.message)
      }
    }
  }
}
