// Servidor intermediário (Cloudflare Worker) entre a página e a APIBrasil ("API Placa Dados").
// Os tokens da APIBrasil ficam guardados aqui, nunca na página.

const API_URL = 'https://gateway.apibrasil.io/api/v2/vehicles/dados';
const FORMATO_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

function responder(corpo, status, cabecalhos) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      cabecalhos
    ),
  });
}

// "Ano_Modelo", "anoModelo" e "ANOMODELO" viram "anomodelo".
function normalizar(chave) {
  return String(chave).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
}

// A documentação pública da APIBrasil não mostra o formato da resposta.
// Por isso a leitura procura os campos em qualquer nível do JSON, ignorando
// maiúsculas, acentos e separadores. Confira com uma resposta real (veja o README).
function procurar(objeto, nomes) {
  const fila = [{ valor: objeto, nivel: 0 }];
  while (fila.length) {
    const atual = fila.shift();
    const v = atual.valor;
    if (!v || typeof v !== 'object' || atual.nivel > 4) continue;
    const chaves = Object.keys(v);
    for (let n = 0; n < nomes.length; n++) {
      for (let i = 0; i < chaves.length; i++) {
        if (normalizar(chaves[i]) !== nomes[n]) continue;
        const achado = v[chaves[i]];
        if (achado !== null && achado !== undefined && achado !== '' && typeof achado !== 'object') {
          return achado;
        }
      }
    }
    for (let i = 0; i < chaves.length; i++) {
      if (v[chaves[i]] && typeof v[chaves[i]] === 'object') {
        fila.push({ valor: v[chaves[i]], nivel: atual.nivel + 1 });
      }
    }
  }
  return null;
}

function mapear(dados, placa) {
  const marca = procurar(dados, ['marca', 'brand']);
  let modelo = procurar(dados, ['modelo', 'model']);
  const marcaModelo = procurar(dados, ['marcamodelo']);
  if (!modelo && marcaModelo) modelo = marcaModelo;

  if (!marca && !modelo) return null;

  return {
    placa: procurar(dados, ['placa', 'plate']) || placa,
    marca: marca,
    modelo: modelo,
    ano: procurar(dados, ['anomodelo', 'ano', 'anofabricacao', 'year']),
    cor: procurar(dados, ['cor', 'color']),
    combustivel: procurar(dados, ['combustivel', 'fuel']),
    uf: procurar(dados, ['uf', 'estado', 'state']),
    cidade: procurar(dados, ['municipio', 'cidade', 'city']),
    situacao: procurar(dados, ['situacao', 'situacaodoveiculo']),
  };
}

export default {
  async fetch(request, env) {
    const permitidas = String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(function (o) { return o.trim(); })
      .filter(Boolean);
    const origem = request.headers.get('Origin') || '';

    // Só aceita chamadas vindas das páginas autorizadas.
    if (permitidas.indexOf(origem) === -1) {
      return responder({ erro: 'origem_nao_permitida' }, 403, {});
    }

    const cors = {
      'Access-Control-Allow-Origin': origem,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'GET') {
      return responder({ erro: 'metodo_nao_permitido' }, 405, cors);
    }

    if (!env.APIBRASIL_DEVICE_TOKEN || !env.APIBRASIL_BEARER_TOKEN) {
      console.error('Tokens da APIBrasil não configurados');
      return responder({ erro: 'servico_indisponivel' }, 502, cors);
    }

    const url = new URL(request.url);
    const placa = String(url.searchParams.get('placa') || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (!FORMATO_PLACA.test(placa)) {
      return responder({ erro: 'placa_invalida' }, 400, cors);
    }

    let resposta;
    try {
      resposta = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'DeviceToken': env.APIBRASIL_DEVICE_TOKEN,
          'Authorization': 'Bearer ' + env.APIBRASIL_BEARER_TOKEN,
        },
        body: JSON.stringify({ placa: placa }),
      });
    } catch (e) {
      console.error('Falha de rede ao chamar a APIBrasil');
      return responder({ erro: 'servico_indisponivel' }, 502, cors);
    }

    let dados = null;
    try {
      dados = await resposta.json();
    } catch (e) {
      dados = null;
    }

    if (!resposta.ok) {
      // Registra só o status e os nomes dos campos, nunca os tokens nem os valores.
      console.error(
        'APIBrasil respondeu ' + resposta.status +
        ' campos=' + (dados && typeof dados === 'object' ? Object.keys(dados).join(',') : 'nenhum')
      );
      if (resposta.status === 429) return responder({ erro: 'muitas_consultas' }, 429, cors);
      if (resposta.status === 404) return responder({ erro: 'nao_encontrada' }, 404, cors);
      return responder({ erro: 'servico_indisponivel' }, 502, cors);
    }

    const veiculo = mapear(dados, placa);

    if (!veiculo) {
      console.error(
        'Resposta da APIBrasil sem marca/modelo. campos=' +
        (dados && typeof dados === 'object' ? Object.keys(dados).join(',') : 'nenhum')
      );
      return responder({ erro: 'nao_encontrada' }, 404, cors);
    }

    return responder(veiculo, 200, cors);
  },
};
