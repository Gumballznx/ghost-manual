// Mensagem no estilo do bot (caixa com borda ┊), com quebra de linha manual para o
// texto não depender de onde o WhatsApp decide quebrar.
//
//   cardGhost('SUB-BOT REMOVIDO', [
//     ['📱', 'Número: +25884...'],      // linha com marcador
//     ['🗑️', 'Sessão apagada da VPS.'],
//     null,                              // linha em branco
//     '1. passo solto'                   // texto simples recuado
//   ])
const LARGURA = 36
const RECUO_MARCADOR = '┊               ' // continuação de linha com marcador
const RECUO_SIMPLES = '┊      '            // continuação de linha simples

function quebrar(texto, largura = LARGURA) {
  const palavras = String(texto).split(/ +/)
  const linhas = []
  let atual = ''
  for (const p of palavras) {
    if (atual && (atual + ' ' + p).length > largura) {
      linhas.push(atual)
      atual = p
    } else {
      atual = atual ? atual + ' ' + p : p
    }
  }
  if (atual) linhas.push(atual)
  return fecharMarcadores(linhas.length ? linhas : [''])
}

// O WhatsApp só aplica negrito (*) e código (`) quando o marcador abre e fecha na MESMA
// linha. Se a quebra cair no meio, fecha o marcador no fim da linha e reabre na próxima.
function fecharMarcadores(linhas) {
  const aberto = { '*': false, '`': false }
  return linhas.map(linha => {
    let prefixo = ''
    for (const m of ['*', '`']) if (aberto[m]) prefixo += m
    let texto = prefixo + linha
    for (const m of ['*', '`']) {
      const qtd = (texto.match(m === '*' ? /\*/g : /`/g) || []).length
      aberto[m] = qtd % 2 === 1
    }
    let sufixo = ''
    for (const m of ['*', '`']) if (aberto[m]) sufixo = m + sufixo
    return texto + sufixo
  })
}

function cardGhost(titulo, itens = []) {
  const out = [`╭┈⊰ 👻 『 *${String(titulo).toUpperCase()}* 』`, '┊']
  for (const item of itens) {
    if (item === null || item === undefined || item === '') {
      out.push('┊')
    } else if (Array.isArray(item)) {
      const [emoji, texto] = item
      const partes = quebrar(texto)
      out.push(`┊•.̇𖥨֗${emoji}⭟ ${partes[0]}`)
      for (const p of partes.slice(1)) out.push(RECUO_MARCADOR + p)
    } else {
      const partes = quebrar(item)
      for (const p of partes) out.push(RECUO_SIMPLES + p)
    }
  }
  out.push('╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯')
  return out.join('\n')
}

module.exports = { cardGhost, quebrar }
