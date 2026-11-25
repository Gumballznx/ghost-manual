const path = require('path')
const config = require(path.join(__dirname, '../../../data/config.json'))
const { isLeaderCheck, isSubdonoCheck } = require('../../utils/baileys')
const subbotManager = require('../../bot/subbotManager')
const { cardGhost } = require('../../utils/cardGhost')

module.exports = async (sock, msg, from, sender, text) => {
  const prefix = config.prefix || '.'
  const trimmed = (text || '').trim()
  if (!trimmed.startsWith(prefix)) return false

  const args = trimmed.slice(prefix.length).trim().split(/\s+/)
  const command = (args[0] || '').toLowerCase()

  const isSubbotCmd = command === 'subbot' || command === 'subbots'
  const isConectCmd = command === 'conect' || command === 'conectar'
  const isDelSubbotCmd = command === 'delsubbot' || command === 'deletesubbot'
  const isMeusGruposCmd = command === 'meusgrupos' || command === 'meusgruposub'

  if (!isSubbotCmd && !isConectCmd && !isDelSubbotCmd && !isMeusGruposCmd) {
    return false
  }

  const isGroup = from.endsWith('@g.us')
  const isOwnerOrSubdono = isLeaderCheck(sender, msg) || isSubdonoCheck(sender)
  const isAutorizado = subbotManager.isAutorizado(sender, msg)

  // ==========================================
  // CAMADA DE SEGURANÇA RESTRITA:
  // Apenas Dono, Subdonos e Revendedores Autorizados
  // Membros comuns e admins não autorizados são bloqueados.
  // ==========================================
  if (!isAutorizado) {
    await sock.sendMessage(from, {
      text: [
        '╭┈⊰ 👻 『 *ACESSO RESTRITO* 』',
        '┊',
        '┊•.̇𖥨֗⛔⭟ *Você não tem permissão para gerenciar sub-bots.*',
        '┊',
        '┊•.̇𖥨֗🔒⭟ *Quem pode executar:*',
        '┊   1. Dono do Bot',
        '┊   2. Subdonos',
        '┊   3. Revendedores / Usuários autorizados',
        '┊',
        '┊•.̇𖥨֗💡⭟ Solicite autorização ao Dono ou Subdono.',
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
      ].join('\n')
    }, { quoted: msg })
    return true
  }

  // ==========================================
  // COMANDO DIRETO: .meusgrupos
  // ==========================================
  if (isMeusGruposCmd) {
    return await listarGruposSessoes(sock, msg, from, sender, args, isOwnerOrSubdono, prefix)
  }

  // ==========================================
  // GESTÃO DE PERMISSÕES (Exclusivo Dono & Subdono):
  // .subbot autorizar <numero | @user>
  // .subbot desautorizar <numero | @user>
  // .subbot autorizados
  // ==========================================
  const subOpcao = (args[1] || '').toLowerCase()

  // .subbot <nº> grupos  → nome, membros e link de cada grupo em que o sub-bot está
  if (isSubbotCmd && /^#?\d{1,3}$/.test(args[1] || '') && /^(grupos|grupo|links|link)$/i.test(args[2] || '')) {
    return await enviarLinksGrupos(sock, msg, from, sender, args[1], isOwnerOrSubdono, prefix)
  }

  if (subOpcao === 'autorizar' || subOpcao === 'auth' || subOpcao === 'permitir' || subOpcao === 'add') {
    if (!isOwnerOrSubdono) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Apenas o Dono ou Subdono podem autorizar novos usuários.*`]])
      }, { quoted: msg })
      return true
    }
    let rawNumber = args[2]

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant
    if (quoted) {
      rawNumber = quoted.split('@')[0].split(':')[0]
    }

    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
    if ((!rawNumber || rawNumber.startsWith('@')) && mentions && mentions.length > 0) {
      rawNumber = mentions[0].split('@')[0].split(':')[0]
    }

    if (!rawNumber) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Informe o número, mencione @user ou responda à mensagem dele.*`], ['💡', `Exemplo: \`${prefix}subbot autorizar 25884xxxxxxx\``]])
      }, { quoted: msg })
      return true
    }

    try {
      const { buscarNumero } = require('../../bot/core')
      const real = buscarNumero(rawNumber)
      if (real && real.length >= 8) {
        rawNumber = real
      } else if (rawNumber.length >= 14 || rawNumber.startsWith('178') || rawNumber.startsWith('159')) {
        const { resolverParticipanteGrupo } = require('../../utils/baileys')
        const res = await resolverParticipanteGrupo(sock, from, rawNumber, msg)
        if (res) {
          const c = res.split('@')[0].split(':')[0].replace(/\D/g, '')
          if (c && c.length >= 8 && c !== rawNumber) rawNumber = c
        }
      }
    } catch {}

    const validacaoAut = subbotManager.validarNumeroComDDI(rawNumber)
    if (!validacaoAut.ok) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*${validacaoAut.erro}*`], ['💡', `Exemplo: \`${prefix}subbot autorizar 258841234567\` ou mencione o @usuário.`]])
      }, { quoted: msg })
      return true
    }

    try {
      const resultado = subbotManager.autorizarUsuario(rawNumber, sender)
      if (resultado.status === 'ja_autorizado') {
        await sock.sendMessage(from, {
          text: [
            '╭┈⊰ 👻 『 *AVISO: JÁ AUTORIZADO* 』',
            '┊',
            `┊•.̇𖥨֗ℹ️⭟ O usuário *+${resultado.numero}* já está na lista!`,
            '┊      Ele já possui permissão ativa para gerenciar sub-bots.',
            '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
          ].join('\n')
        }, { quoted: msg })
      } else {
        await sock.sendMessage(from, {
          text: [
            '╭┈⊰ 👻 『 *USUÁRIO AUTORIZADO* 』',
            '┊',
            `┊•.̇𖥨֗✅⭟ Usuário *+${resultado.numero}* autorizado`,
            '┊               com sucesso!',
            '┊•.̇𖥨֗📱⭟ Agora ele tem permissão para usar',
            `┊               \`${prefix}conect\` e gerenciar sub-bots.`,
            '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
          ].join('\n')
        }, { quoted: msg })
      }
    } catch (e) {
      await sock.sendMessage(from, { text: cardGhost('ERRO', [['❌', `${e.message}`]]) }, { quoted: msg })
    }
    return true
  }

  if (subOpcao === 'desautorizar' || subOpcao === 'unauth' || subOpcao === 'revogar' || subOpcao === 'remove') {
    if (!isOwnerOrSubdono) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Apenas o Dono ou Subdono podem desautorizar usuários.*`]])
      }, { quoted: msg })
      return true
    }
    let rawNumber = args[2]

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant
    if (quoted) {
      rawNumber = quoted.split('@')[0].split(':')[0]
    }

    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
    if ((!rawNumber || rawNumber.startsWith('@')) && mentions && mentions.length > 0) {
      rawNumber = mentions[0].split('@')[0].split(':')[0]
    }

    if (!rawNumber) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Informe o número a desautorizar.*`], ['💡', `Exemplo: \`${prefix}subbot desautorizar 25884xxxxxxx\``]])
      }, { quoted: msg })
      return true
    }

    try {
      const { buscarNumero } = require('../../bot/core')
      const real = buscarNumero(rawNumber)
      if (real && real.length >= 8) {
        rawNumber = real
      }
    } catch {}

    const resultado = subbotManager.desautorizarUsuario(rawNumber)
    if (resultado.status === 'nunca_autorizado') {
      await sock.sendMessage(from, {
        text: [
          '╭┈⊰ 👻 『 *AVISO: NÃO AUTORIZADO* 』',
          '┊',
          `┊•.̇𖥨֗⚠️⭟ O usuário *+${resultado.numero}* nunca foi autorizado`,
          '┊      ou não consta na lista de permissões!',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')
      }, { quoted: msg })
    } else {
      await sock.sendMessage(from, {
        text: [
          '╭┈⊰ 👻 『 *AUTORIZAÇÃO REVOGADA* 』',
          '┊',
          `┊•.̇𖥨֗🗑️⭟ O usuário *+${resultado.numero}* foi removido com sucesso!`,
          '┊      Ele não tem mais acesso aos comandos de sub-bots.',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')
      }, { quoted: msg })
    }
    return true
  }

  if (subOpcao === 'autorizados' || subOpcao === 'authlist') {
    if (!isOwnerOrSubdono) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Apenas o Dono ou Subdono podem consultar a lista de autorizados.*`]])
      }, { quoted: msg })
      return true
    }
    const lista = subbotManager.listarAutorizados()
    if (!lista.length) {
      await sock.sendMessage(from, {
        text: cardGhost('AVISO', [['ℹ️', `*Nenhum revendedor/usuário autorizado no momento.* Apenas Dono e Subdonos têm acesso.`]])
      }, { quoted: msg })
      return true
    }
    const linhas = [
      '╭┈⊰ 👻 『 *REVENDEDORES / USUÁRIOS AUTORIZADOS* 』',
      '┊'
    ]
    lista.forEach((u, idx) => {
      linhas.push(`┊•.̇𖥨֗👤⭟ *#${idx + 1}:* +${u}`)
    })
    linhas.push('┊')
    linhas.push(`┊•.̇𖥨֗💡⭟ Para revogar: \`${prefix}subbot desautorizar <numero>\``)
    linhas.push('╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯')
    await sock.sendMessage(from, { text: linhas.join('\n') }, { quoted: msg })
    return true
  }

  // ==========================================
  // COMANDO: .subbot grupos [numero] / .subbot sessoes
  // Dono vê todas as sessões e seus grupos.
  // Dono da sessão vê apenas os grupos da sua sessão.
  // ==========================================
  if (subOpcao === 'grupos' || subOpcao === 'grupo' || subOpcao === 'sessao' || subOpcao === 'sessoes') {
    return await listarGruposSessoes(sock, msg, from, sender, args, isOwnerOrSubdono, prefix)
  }

  // ==========================================
  // COMANDO DIRETO: .conect / .conectar <numero>
  // ==========================================
  if (isConectCmd) {
    const rawNumber = args[1]
    if (!rawNumber) {
      await sock.sendMessage(from, {
        text: [
          '╭┈⊰ 👻 『 *CONECTAR SUB-BOT* 』',
          '┊',
          '┊•.̇𖥨֗📱⭟ *Uso correto:*',
          `┊      ${prefix}conect <número_com_ddi>`,
          '┊',
          '┊•.̇𖥨֗💡⭟ *Exemplo (Moçambique):*',
          `┊      ${prefix}conect 258841234567`,
          '┊',
          '┊•.̇𖥨֗ℹ️⭟ O bot irá gerar um código de 8 dígitos',
          '┊      para você conectar pelo WhatsApp do chip.',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')
      }, { quoted: msg })
      return true
    }

    return await executarConexaoSubbot(sock, msg, from, sender, rawNumber, prefix)
  }

  // ==========================================
  // COMANDO DIRETO: .delsubbot <numero>
  // ==========================================
  if (isDelSubbotCmd) {
    const rawNumber = args[1]
    if (!rawNumber) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Informe o sub-bot a remover.*`], ['💡', `Exemplo: \`${prefix}delsubbot 2\` (nº da lista do ${prefix}subbots)`]])
      }, { quoted: msg })
      return true
    }
    return await executarRemoverSubbot(sock, msg, from, sender, rawNumber, isOwnerOrSubdono)
  }

  // ==========================================
  // SUBCOMANDOS: .subbot [opção]
  // ==========================================

  // 1. .subbot lista / .subbots / .subbot status
  if (!subOpcao || subOpcao === 'lista' || subOpcao === 'list' || subOpcao === 'status' || command === 'subbots') {
    const lista = subbotManager.listaVisivel(sender, isOwnerOrSubdono)

    if (!lista || lista.length === 0) {
      await sock.sendMessage(from, {
        text: [
          '╭┈⊰ 👻 『 *SISTEMA DE SUB-BOTS* 』',
          '┊',
          `┊•.̇𖥨֗ℹ️⭟ *${isOwnerOrSubdono ? 'Nenhum sub-bot online no momento.' : 'Você não possui nenhum sub-bot online.'}*`,
          '┊',
          `┊•.̇𖥨֗➕⭟ Digite *${prefix}conect <numero>* para conectar`,
          '┊      um chip secundário agora mesmo!',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')
      }, { quoted: msg })
      return true
    }

    const linhas = [
      `╭┈⊰ 👻 『 *${isOwnerOrSubdono ? 'SUB-BOTS ONLINE' : 'SEUS SUB-BOTS ONLINE'}* 』`,
      '┊'
    ]

    for (let i = 0; i < lista.length; i++) {
      const sb = lista[i]
      const qtdGrupos = sb.grupos ? sb.grupos.length : 0
      linhas.push(`┊•.̇𖥨֗📱⭟ *Sub-Bot #${i + 1}:* ${subbotManager.rotulo(sb.numero)}`)
      linhas.push(`┊      Status: *🟢 Online*`)
      linhas.push(`┊      Grupos atendidos: *${qtdGrupos}*`)
      linhas.push('┊')
    }

    linhas.push(`┊•.̇𖥨֗💡⭟ *Comandos:*`)
    linhas.push(`┊   • \`${prefix}subbot grupos\` › Ver grupos autorizados`)
    linhas.push(`┊   • \`${prefix}subbot vincular [link ou JID]\` › Atrelar grupo ao sub-bot`)
    linhas.push(`┊   • \`${prefix}subbot desvincular\` › Voltar para bot principal`)
    linhas.push(`┊   • \`${prefix}subbot <nº> grupos\` › Links dos grupos do sub-bot`)
    linhas.push(`┊   • \`${prefix}subbot del <nº>\` › Remover sub-bot`)
    if (isOwnerOrSubdono) {
      linhas.push(`┊   • \`${prefix}subbot autorizar <numero>\` › Autorizar revendedor`)
      linhas.push(`┊   • \`${prefix}subbot autorizados\` › Ver lista de autorizados`)
    }
    linhas.push('╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯')

    await sock.sendMessage(from, { text: linhas.join('\n') }, { quoted: msg })
    return true
  }

  // 2. .subbot conectar / .subbot conect <numero>
  if (subOpcao === 'conect' || subOpcao === 'conectar' || subOpcao === 'add') {
    const rawNumber = args[2]
    if (!rawNumber) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Informe o número com DDI.*`], ['💡', `Exemplo: \`${prefix}subbot conect 258841234567\``]])
      }, { quoted: msg })
      return true
    }
    return await executarConexaoSubbot(sock, msg, from, sender, rawNumber, prefix)
  }

  // 3. .subbot del / remover <numero>
  if (subOpcao === 'del' || subOpcao === 'remover' || subOpcao === 'delete') {
    const rawNumber = args[2]
    if (!rawNumber) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Informe o sub-bot a remover.*`], ['💡', `Exemplo: \`${prefix}subbot del 2\` (nº da lista do ${prefix}subbots)`]])
      }, { quoted: msg })
      return true
    }
    return await executarRemoverSubbot(sock, msg, from, sender, rawNumber, isOwnerOrSubdono)
  }

  // 4. .subbot vincular [grupo] [numero]
  //    - dentro do grupo:  .subbot vincular            (funciona com só o sub-bot no grupo)
  //    - de qualquer chat: .subbot vincular <JID do grupo | link de convite> [numero]
  if (subOpcao === 'vincular' || subOpcao === 'associar') {
    let alvoJid = null
    let alvoLink = null
    let rawNumber = null
    for (const a of args.slice(2)) {
      const digitos = a.replace(/\D/g, '')
      if (/chat\.whatsapp\.com\//i.test(a)) alvoLink = a
      else if (/@g\.us$/i.test(a)) alvoJid = a
      else if (digitos.length >= 17) alvoJid = a.replace(/[^\d-]/g, '') + '@g.us' // ID de grupo sem @g.us
      else if (digitos.length >= 8) rawNumber = digitos
    }

    if (!alvoJid && !alvoLink && !isGroup) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Informe o grupo.*`], ['💡', `Use dentro do grupo: \`${prefix}subbot vincular\``], `Ou daqui: \`${prefix}subbot vincular <link do grupo ou JID>\``])
      }, { quoted: msg })
      return true
    }

    // Qual sub-bot: o número informado; senão o sub-bot que recebeu a mensagem;
    // senão o único sub-bot do usuário.
    if (!rawNumber) rawNumber = subbotManager.numeroDoSock(sock)
    if (!rawNumber) {
      const meus = subbotManager.getSubbotsDoUsuario(sender)
      if (meus.length === 1) rawNumber = meus[0].numero
    }
    if (!rawNumber) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*Informe o número do sub-bot.*`], ['💡', `Exemplo: \`${prefix}subbot vincular 258841234567\``]])
      }, { quoted: msg })
      return true
    }
    const numLimpo = subbotManager.normalizarNumero(rawNumber)

    // A conexão é de quem a criou: só ele (ou Dono/Subdono) escolhe os grupos
    if (!isOwnerOrSubdono) {
      const meus = subbotManager.getSubbotsDoUsuario(sender)
      if (!meus.some(s => s.numero === numLimpo)) {
        await sock.sendMessage(from, { text: cardGhost('ACESSO RESTRITO', [['⛔', `Você só pode vincular grupos aos seus próprios sub-bots.`]]) }, { quoted: msg })
        return true
      }
    }

    const ativo = subbotManager.getSubbotPorNumero(numLimpo)
    if (!ativo?.sock || ativo.status !== 'online') {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*O sub-bot +${numLimpo} não está online.*`], ['💡', `Conecte-o com \`${prefix}conect ${numLimpo}\` e tente de novo.`]])
      }, { quoted: msg })
      return true
    }

    // Resolver o grupo pelo próprio sub-bot (ele é quem precisa estar lá)
    let gid = alvoJid || (isGroup ? from : null)
    if (alvoLink) {
      try {
        const code = alvoLink.split(/chat\.whatsapp\.com\//i)[1].split(/[?\s/#]/)[0]
        const info = await ativo.sock.groupGetInviteInfo(code)
        gid = info?.id ? (String(info.id).endsWith('@g.us') ? info.id : info.id + '@g.us') : null
      } catch {}
      if (!gid) {
        await sock.sendMessage(from, { text: cardGhost('ERRO', [['❌', `*Link de grupo inválido ou expirado.*`]]) }, { quoted: msg })
        return true
      }
    }

    let meta = null
    try { meta = await ativo.sock.groupMetadata(gid) } catch {}
    if (!meta?.participants?.length) {
      await sock.sendMessage(from, {
        text: cardGhost('ERRO', [['❌', `*O sub-bot +${numLimpo} não está nesse grupo.*`], ['💡', `Adicione o número do sub-bot ao grupo e tente de novo.`]])
      }, { quoted: msg })
      return true
    }

    const checkVinculo = subbotManager.podeVincularGrupo(numLimpo, gid)
    if (!checkVinculo.ok) {
      await sock.sendMessage(from, {
        text: cardGhost('VÍNCULO NÃO PERMITIDO', [
          ['⛔', `*${checkVinculo.erro}*`],
          ['📱', `*Sub-Bot:* +${numLimpo}`],
          ['💡', `Vincule este sub-bot em outro grupo usando \`${prefix}subbot vincular\`.`]
        ])
      }, { quoted: msg })
      return true
    }

    subbotManager.vincularGrupo(numLimpo, gid)
    await sock.sendMessage(from, {
      text: [
        '╭┈⊰ 👻 『 *GRUPO VINCULADO* 』',
        '┊',
        `┊•.̇𖥨֗👥⭟ *Grupo:* ${meta.subject || gid}`,
        `┊•.̇𖥨֗📱⭟ *Sub-Bot:* +${numLimpo}`,
        '┊•.̇𖥨֗🤖⭟ O sub-bot passa a atender esse grupo.',
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
      ].join('\n')
    }, { quoted: msg })
    return true
  }

  // 5. .subbot desvincular (desvincula o grupo atual do sub-bot)
  if (subOpcao === 'desvincular' || subOpcao === 'soltar') {
    if (!isGroup) {
      await sock.sendMessage(from, { text: cardGhost('ERRO', [['❌', `Este comando só pode ser usado dentro de um grupo.`]]) }, { quoted: msg })
      return true
    }
    subbotManager.desvincularGrupo(from)
    await sock.sendMessage(from, {
      text: cardGhost('ATUALIZADO', [['🔄', `*Grupo Desvinculado!*`], null, `O bot principal reassumiu o atendimento deste grupo.`])
    }, { quoted: msg })
    return true
  }

  // Ajuda padrão
  const ajuda = [
    '╭┈⊰ 👻 『 *SISTEMA DE SUB-BOTS* 』',
    '┊',
    '┊•.̇𖥨֗🤖⭟ *Comandos disponíveis:*',
    `┊  • \`${prefix}conect <numero>\` › Conectar novo sub-bot`,
    `┊  • \`${prefix}subbots\` › Ver sub-bots online`,
    `┊  • \`${prefix}subbot grupos\` › Ver grupos autorizados para a sessão`,
    `┊  • \`${prefix}subbot vincular [link ou JID]\` › Atrelar grupo ao sub-bot`,
    `┊  • \`${prefix}subbot desvincular\` › Bot principal reassume`,
    `┊  • \`${prefix}subbot del <numero>\` › Remover sub-bot`
  ]
  if (isOwnerOrSubdono) {
    ajuda.push(`┊  • \`${prefix}subbot autorizar <numero>\` › Autorizar revendedor`)
    ajuda.push(`┊  • \`${prefix}subbot desautorizar <numero>\` › Revogar permissão`)
    ajuda.push(`┊  • \`${prefix}subbot autorizados\` › Listar autorizados`)
  }
  ajuda.push('╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯')

  await sock.sendMessage(from, { text: ajuda.join('\n') }, { quoted: msg })
  return true
}

async function listarGruposSessoes(sock, msg, from, sender, args, isOwnerOrSubdono, prefix) {
  const numeroFiltro = args[2] ? String(args[2]).replace(/\D/g, '') : ''

  async function obterNomeGrupo(s, gid) {
    try {
      const { getGroupMetadataCached } = require('../../utils/baileys')
      const meta = await getGroupMetadataCached(s, gid)
      if (meta && meta.subject) return meta.subject
    } catch {}
    return 'Grupo WhatsApp'
  }

  // ==========================================
  // 1. VISÃO DO DONO PRINCIPAL / SUBDONOS
  // O dono vê TODAS as sessões e seus grupos
  // ==========================================
  if (isOwnerOrSubdono) {
    let subbotsParaExibir = []

    if (numeroFiltro) {
      const sb = subbotManager.dados.subbots?.[numeroFiltro]
      if (!sb) {
        await sock.sendMessage(from, {
          text: cardGhost('ERRO', [['❌', `*Nenhuma sessão encontrada para o número +${numeroFiltro}.*`]])
        }, { quoted: msg })
        return true
      }
      subbotsParaExibir.push(sb)
    } else {
      subbotsParaExibir = Object.values(subbotManager.dados.subbots || {})
    }

    if (!subbotsParaExibir.length) {
      await sock.sendMessage(from, {
        text: cardGhost('AVISO', [['ℹ️', `*Nenhuma sessão de sub-bot cadastrada no momento.*`]])
      }, { quoted: msg })
      return true
    }

    const linhas = [
      '╭┈⊰ 👻 『 *RELATÓRIO GERAL DE SESSÕES & GRUPOS* 』',
      '┊',
      '┊👑 *Acesso Administrativo (Dono do Bot)*',
      `┊Total de Sessões: *${subbotsParaExibir.length}*`,
      '┊'
    ]

    for (const sb of subbotsParaExibir) {
      const active = subbotManager.activeSubbots.get(sb.numero)
      const statusIcon = active?.status === 'online' ? '🟢 Online' : (sb.status === 'pareando' ? '🟡 Pareando' : '🔴 Offline')
      const grupos = sb.grupos || []

      linhas.push(`┊📱 *Sessão: ${subbotManager.rotulo(sb.numero)}* [${statusIcon}]`)
      if (sb.criadoPor) {
        const criadorClean = String(sb.criadoPor).split('@')[0].split(':')[0]
        linhas.push(`┊👤 *Criador:* wa.me/${criadorClean}`)
      }
      linhas.push(`┊📂 *Grupos Atendidos:* ${grupos.length}`)

      if (grupos.length === 0) {
        linhas.push('┊  › _Nenhum grupo vinculado a este chip._')
      } else {
        for (let i = 0; i < grupos.length; i++) {
          const gid = grupos[i]
          const nome = await obterNomeGrupo(active?.sock || sock, gid)
          linhas.push(`┊  ${i + 1}. 📌 *${nome}*`)
          linhas.push(`┊     › \`${gid}\``)
        }
      }
      linhas.push('┊')
    }

    linhas.push(`┊•.̇𖥨֗💡⭟ *Filtrar por sessão:* \`${prefix}subbot grupos <numero>\``)
    linhas.push('╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯')

    await sock.sendMessage(from, { text: linhas.join('\n') }, { quoted: msg })
    return true
  }

  // ==========================================
  // 2. VISÃO DO DONO DA SESSÃO (Revendedor)
  // O revendedor vê APENAS os grupos da sua sessão
  // ==========================================
  const minhasSessoes = subbotManager.getSubbotsDoUsuario(sender)

  if (!minhasSessoes || minhasSessoes.length === 0) {
    await sock.sendMessage(from, {
      text: [
        '╭┈⊰ 👻 『 *SEUS GRUPOS VINCULADOS* 』',
        '┊',
        '┊•.̇𖥨֗ℹ️⭟ *Você ainda não possui nenhuma sessão de sub-bot criada.*',
        `┊•.̇𖥨֗💡⭟ Conecte seu chip usando: \`${prefix}conect <seu_numero>\``,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
      ].join('\n')
    }, { quoted: msg })
    return true
  }

  let sessoesParaExibir = minhasSessoes
  if (numeroFiltro) {
    sessoesParaExibir = minhasSessoes.filter(s => s.numero === numeroFiltro)
    if (!sessoesParaExibir.length) {
      await sock.sendMessage(from, {
        text: cardGhost('ACESSO RESTRITO', [['⛔', `*Acesso Restrito:* Você só tem permissão para visualizar os grupos pertencentes à sua própria sessão.`]])
      }, { quoted: msg })
      return true
    }
  }

  const linhas = [
    '╭┈⊰ 👻 『 *SEUS GRUPOS AUTORIZADOS* 』',
    '┊'
  ]

  for (const sb of sessoesParaExibir) {
    const active = subbotManager.activeSubbots.get(sb.numero)
    const statusIcon = active?.status === 'online' ? '🟢 Online' : '🔴 Offline'
    const grupos = sb.grupos || []

    linhas.push(`┊📱 *Sua Sessão:* ${subbotManager.rotulo(sb.numero)} [${statusIcon}]`)
    linhas.push(`┊📂 *Total de Grupos Vinculados:* ${grupos.length}`)
    linhas.push('┊')

    if (grupos.length === 0) {
      linhas.push('┊•.̇𖥨֗ℹ️⭟ *Nenhum grupo vinculado a esta sessão ainda.*')
      linhas.push(`┊      Para vincular um grupo, digite no grupo desejado:`)
      linhas.push(`┊      \`${prefix}subbot vincular\` (ou com o link do grupo)`)
    } else {
      for (let i = 0; i < grupos.length; i++) {
        const gid = grupos[i]
        const nome = await obterNomeGrupo(active?.sock || sock, gid)
        linhas.push(`┊•.̇𖥨֗📌⭟ *${i + 1}. ${nome}*`)
        linhas.push(`┊      ID: \`${gid}\``)
      }
    }
    linhas.push('┊')
  }

  linhas.push(`┊•.̇𖥨֗💡⭟ *Comandos:*`)
  linhas.push(`┊   • \`${prefix}subbot vincular [link ou JID]\` › Atrelar grupo ao sub-bot`)
  linhas.push(`┊   • \`${prefix}subbot desvincular\` › Desatrelar grupo atual`)
  linhas.push('╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯')

  await sock.sendMessage(from, { text: linhas.join('\n') }, { quoted: msg })
  return true
}

async function executarConexaoSubbot(sock, msg, from, sender, rawNumber, prefix) {
  const cleanNumber = String(rawNumber).replace(/\D/g, '')
  const validacao = subbotManager.validarNumeroComDDI(cleanNumber)
  if (!validacao.ok) {
    await sock.sendMessage(from, {
      text: cardGhost('ERRO', [['❌', `*${validacao.erro}*`], ['💡', `Exemplo: \`${prefix}conect 258841234567\``]])
    }, { quoted: msg })
    return true
  }

  const existing = subbotManager.getSubbotPorNumero(cleanNumber)
  if (existing && existing.status === 'online') {
    await sock.sendMessage(from, {
      text: cardGhost('SUB-BOT JÁ CONECTADO', [['📱', `*Número:* +${cleanNumber}`], ['🟢', '*Status:* ONLINE']])
    }, { quoted: msg })
    return true
  }

  await sock.sendMessage(from, {
    text: cardGhost('SUB-BOT: INICIANDO CONEXÃO', [['📱', `*Número:* +${cleanNumber}`], ['⏳', 'Gerando o código de pareamento...'], ['💡', 'Aguarde alguns segundos.']])
  }, { quoted: msg })

  try {
    let codigoEnviado = false

    await subbotManager.conectarSubbot({
      numero: cleanNumber,
      grupoId: from.endsWith('@g.us') ? from : null,
      autorJid: sender,
      onPairingCode: async (formattedCode, rawCode) => {
        if (codigoEnviado) return
        codigoEnviado = true

        const cardMsg = [
          '╭┈⊰ 👻 『 *SUB-BOT: CÓDIGO DE CONEXÃO* 』',
          '┊',
          `┊•.̇𖥨֗📱⭟ *Número Alvo:* +${cleanNumber}`,
          '┊•.̇𖥨֗🔑⭟ *Código de Pareamento:*',
          '┊',
          `┊     👉 *${formattedCode}* 👈`,
          '┊',
          '┊•.̇𖥨֗📋⭟ *Como conectar no WhatsApp:*',
          '┊  1. Abra o WhatsApp no aparelho desse chip.',
          '┊  2. Toque nos *3 pontinhos* (ou Configurações).',
          '┊  3. Selecione *Aparelhos Conectados*.',
          '┊  4. Toque em *Conectar um aparelho*.',
          '┊  5. Escolha *Conectar com número de telefone*.',
          '┊  6. Digite o código de 8 dígitos acima.',
          '┊',
          '┊•.̇𖥨֗⏱️⭟ *Atenção:* O código expira em ~60 segundos.',
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')

        try {
          await sock.sendMessage(from, { text: cardMsg }, { quoted: msg })
          // Envia o código limpo na sequência para facilitar copiar no celular
          await sock.sendMessage(from, { text: `${rawCode || formattedCode.replace(/-/g, '')}` })
        } catch (sendErr) {
          console.error('[SUBBOT] Erro ao enviar mensagem do código:', sendErr.message)
        }
      },
      onConnected: async (num) => {
        try {
          const avisoOutroGrupo = from.endsWith('@g.us') ? '1. Adicione o número a outro grupo (não neste)' : '1. Adicione o número ao grupo'
          await sock.sendMessage(from, {
            text: cardGhost('SUB-BOT CONECTADO COM SUCESSO', [['📱', `*Número Conectado:* +${num}`], ['🟢', '*Status:* ONLINE'], ['🔗', 'Ainda não atende nenhum grupo.'], null, ['💡', '*Para ativar num grupo:*'], avisoOutroGrupo, `2. No grupo envie ${prefix}subbot vincular`, `Ou daqui: ${prefix}subbot vincular <link do grupo>`])
          })
        } catch {}
      },
      onError: async (err) => {
        try {
          await sock.sendMessage(from, {
            text: cardGhost('ERRO NA CONEXÃO', [['📱', `*Número:* +${cleanNumber}`], ['⚠️', err.message || String(err)], ['🔄', `Gere um novo com ${prefix}conect ${cleanNumber}`]])
          }, { quoted: msg })
        } catch {}
      }
    })
  } catch (err) {
    await sock.sendMessage(from, {
      text: cardGhost('ERRO', [['❌', `*Erro ao iniciar conexão do sub-bot:* ${err.message}`]])
    }, { quoted: msg })
  }

  return true
}

async function executarRemoverSubbot(sock, msg, from, sender, ref, isOwnerOrSubdono) {
  const prefix = config.prefix || '.'
  // A posição (#9) é a da lista do .subbots de quem pediu
  const lista = subbotManager.listaVisivel(sender, isOwnerOrSubdono)
  let alvo = subbotManager.resolverSubbot(ref, lista)

  // Dono/Subdono também pode remover pelo número um registro que não está online
  if (!alvo && isOwnerOrSubdono) {
    const digitos = String(ref || '').replace(/\D/g, '')
    if (digitos.length > 3 && subbotManager.dados.subbots?.[digitos]) {
      alvo = { sb: { numero: digitos, ...subbotManager.dados.subbots[digitos] }, posicao: null }
    }
  }

  if (!alvo) {
    await sock.sendMessage(from, {
      text: cardGhost('ERRO', [['❌', `*Sub-bot ${String(ref).replace(/^#/, '').length <= 3 ? '#' + String(ref).replace(/^#/, '') : '+' + String(ref).replace(/\D/g, '')} não existe.*`], ['💡', `Veja a lista com \`${prefix}subbots\`.`]])
    }, { quoted: msg })
    return true
  }

  const num = String(alvo.sb.numero)
  const registro = subbotManager.dados.subbots?.[num] || alvo.sb

  // Revendedor só remove os sub-bots que ele mesmo criou
  if (!isOwnerOrSubdono && registro.criadoPor) {
    const senderClean = String(sender).split('@')[0].split(':')[0].replace(/\D/g, '')
    const criadorClean = String(registro.criadoPor).split('@')[0].split(':')[0].replace(/\D/g, '')
    if (senderClean !== criadorClean) {
      await sock.sendMessage(from, { text: cardGhost('ERRO', [['❌', `*Você só pode remover os sub-bots criados por você.*`]]) }, { quoted: msg })
      return true
    }
  }

  const qtdGrupos = (registro.grupos || []).length
  await subbotManager.desconectarSubbot(num, true)
  const aindaExiste = !!subbotManager.dados.subbots?.[num] || subbotManager.activeSubbots.has(num)

  await sock.sendMessage(from, {
    text: [
      '╭┈⊰ 👻 『 *SUB-BOT REMOVIDO* 』',
      '┊',
      `┊•.̇𖥨֗📱⭟ *Sub-Bot${alvo.posicao ? ' #' + alvo.posicao : ''}:* +${num}`,
      `┊•.̇𖥨֗🗑️⭟ ${aindaExiste ? 'Falha ao remover, tente de novo.' : 'Desconectado e sessão apagada da VPS.'}`,
      `┊•.̇𖥨֗👥⭟ ${qtdGrupos ? qtdGrupos + ' grupo(s) voltaram para o bot principal.' : 'Não atendia nenhum grupo.'}`,
      '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')
  }, { quoted: msg })
  return true
}

// .subbot <nº> grupos → lista os grupos em que o sub-bot está, com nome, membros e link.
// Se um grupo falhar (ex.: sub-bot não é admin), os outros continuam.
async function enviarLinksGrupos(sock, msg, from, sender, ref, isOwnerOrSubdono, prefix) {
  const lista = subbotManager.listaVisivel(sender, isOwnerOrSubdono)
  const alvo = subbotManager.resolverSubbot(ref, lista)
  if (!alvo) {
    await sock.sendMessage(from, {
      text: cardGhost('ERRO', [['❌', `*Sub-bot #${String(ref).replace(/^#/, '')} não existe.*`], ['💡', `Veja a lista com \`${prefix}subbots\`.`]])
    }, { quoted: msg })
    return true
  }

  const num = String(alvo.sb.numero)
  const ativo = subbotManager.getSubbotPorNumero(num)
  if (!ativo?.sock || ativo.status !== 'online') {
    await sock.sendMessage(from, { text: cardGhost('ERRO', [['❌', `*O sub-bot #${alvo.posicao} (+${num}) não está online.*`]]) }, { quoted: msg })
    return true
  }

  let grupos = {}
  try {
    grupos = await ativo.sock.groupFetchAllParticipating() || {}
  } catch (e) {
    await sock.sendMessage(from, { text: cardGhost('ERRO', [['❌', `*Não consegui buscar os grupos do sub-bot:* ${e.message}`]]) }, { quoted: msg })
    return true
  }

  const vinculados = new Set(subbotManager.dados.subbots?.[num]?.grupos || [])
  const itens = Object.values(grupos)
    .filter(g => g && g.id)
    .sort((a, b) => String(a.subject || '').localeCompare(String(b.subject || ''), 'pt'))

  const linhas = [
    `╭┈⊰ 👻 『 *GRUPOS DO SUB-BOT #${alvo.posicao}* 』`,
    `┊•.̇𖥨֗📱⭟ +${num}`,
    `┊•.̇𖥨֗👥⭟ *${itens.length}* grupo(s)`,
    '┊'
  ]

  if (!itens.length) {
    linhas.push('┊ O sub-bot não está em nenhum grupo.')
  }

  for (let i = 0; i < itens.length; i++) {
    const g = itens[i]
    const membros = Array.isArray(g.participants) ? g.participants.length : (g.size || 0)
    linhas.push(`┊ *${i + 1}. ${g.subject || 'Sem nome'}*`)
    linhas.push(`┊    👥 ${membros} membros${vinculados.has(g.id) ? ' · 🔗 vinculado' : ''}`)
    try {
      const code = await ativo.sock.groupInviteCode(g.id)
      if (!code) throw new Error('sem código')
      linhas.push(`┊    https://chat.whatsapp.com/${code}`)
    } catch (e) {
      const m = String(e?.message || e || '')
      const motivo = /not-authorized|forbidden|401|403/i.test(m)
        ? 'o sub-bot não é admin do grupo'
        : /timed? ?out|408/i.test(m) ? 'o WhatsApp não respondeu a tempo' : (m || 'erro desconhecido')
      linhas.push(`┊    ⚠️ Sem link: ${motivo}`)
    }
    linhas.push('┊')
  }
  linhas.push('╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯')

  await sock.sendMessage(from, { text: linhas.join('\n') }, { quoted: msg })
  return true
}

module.exports.executarRemoverSubbot = executarRemoverSubbot
