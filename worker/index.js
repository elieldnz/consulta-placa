// Servidor intermediário (Cloudflare Worker) entre a página e a API Consulta de Placa.
// A chave da API fica guardada aqui, nunca na página.

const API_URL = 'https://consultadeplaca.net/api/v1/lookups';
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

function valor(v) {
  return v === undefined || v === null || v === '' ? null : v;
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

    if (!env.CDP_API_KEY) {
      console.error('CDP_API_KEY não configurada');
      return responder({ erro: 'servico_indisponivel', codigo: 'chave_nao_configurada' }, 502, cors);
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
          'Authorization': 'Bearer ' + env.CDP_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ plate: placa }),
      });
    } catch (e) {
      console.error('Falha de rede ao chamar a API de placas');
      return responder({ erro: 'servico_indisponivel', codigo: 'falha_de_rede' }, 502, cors);
    }

    let dados = null;
    try {
      dados = await resposta.json();
    } catch (e) {
      dados = null;
    }

    if (!resposta.ok) {
      // Registra o código e o identificador da requisição, nunca a chave.
      console.error(
        'API de placas respondeu ' + resposta.status +
        ' code=' + (dados && dados.code) +
        ' request_id=' + (dados && dados.request_id)
      );
      if (resposta.status === 429) return responder({ erro: 'muitas_consultas' }, 429, cors);
      if (resposta.status === 422) return responder({ erro: 'placa_invalida' }, 400, cors);
      // O código do erro (ex.: invalid_api_key, region_not_allowed) não é sigiloso
      // e ajuda a diagnosticar problemas.
      return responder(
        { erro: 'servico_indisponivel', codigo: (dados && dados.code) || 'http_' + resposta.status },
        502,
        cors
      );
    }

    const consulta = dados && dados.lookup;

    if (!consulta || consulta.status !== 'completed') {
      return responder(
        { erro: 'servico_indisponivel', codigo: 'status_' + (consulta && consulta.status) },
        502,
        cors
      );
    }

    if (consulta.result !== 'found' || !consulta.vehicle) {
      return responder({ erro: 'nao_encontrada' }, 404, cors);
    }

    const v = consulta.vehicle;
    let situacao = null;
    if (v.theft === true) situacao = 'Com registro de roubo ou furto';
    if (v.theft === false) situacao = 'Sem registro de roubo ou furto';

    return responder(
      {
        placa: valor(v.plate) || placa,
        marca: valor(v.brand),
        modelo: valor(v.model),
        ano: valor(v.model_year) || valor(v.manufacture_year),
        cor: valor(v.color),
        combustivel: valor(v.fuel),
        uf: valor(v.state),
        cidade: valor(v.city),
        situacao: situacao,
      },
      200,
      cors
    );
  },
};
