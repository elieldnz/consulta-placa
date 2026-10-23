# Servidor intermediário da consulta de placa

A página não pode chamar a API de placas direto, porque a chave da API ficaria visível para qualquer visitante. Este pequeno servidor (Cloudflare Worker) guarda a chave, faz a consulta no serviço [Consulta de Placa](https://consultadeplaca.net/desenvolvedores) e devolve só os dados que a página mostra.

## Como colocar no ar

1. **Crie a conta e a chave da API** em consultadeplaca.net. Comece com uma chave de teste: ela só aceita as placas `TST0001` (encontrada), `TST0002` (não encontrada) e `TST0003` (serviço indisponível), sem custo. Na chave, defina um **limite diário de gasto**; cada consulta real é cobrada, e a página é pública.
2. **Crie uma conta na Cloudflare** (o plano gratuito basta) e, nesta pasta (`worker`), rode:

   ```
   npx wrangler login
   npx wrangler secret put CDP_API_KEY
   npx wrangler deploy
   ```

   O segundo comando pede a chave; cole e confirme. O terceiro mostra o endereço do servidor, algo como `https://consulta-placa-api.SEU-USUARIO.workers.dev`.
   **Sem instalar nada:** no painel da Cloudflare, crie um Worker (Compute → Workers & Pages → Create → Hello World), cole o conteúdo de `index.js` em **Edit code** e publique. Em **Settings → Variables and Secrets**, adicione `ALLOWED_ORIGINS` (tipo Text, valor `https://elieldnz.github.io`) e `CDP_API_KEY` (tipo Secret, com a chave), e publique de novo.
3. **Teste** (troque pelo seu endereço):

   ```
   curl -H "Origin: https://elieldnz.github.io" "https://consulta-placa-api.SEU-USUARIO.workers.dev/?placa=TST0001"
   ```

4. **Ligue a página:** em `index.html`, coloque esse endereço em `API_URL` e publique.
5. Quando tudo funcionar, troque a chave de teste pela chave real (`npx wrangler secret put CDP_API_KEY` de novo).

## Cuidados

- Só as páginas listadas em `ALLOWED_ORIGINS` (`wrangler.toml`) conseguem usar o servidor. Se publicar o site em outro endereço, inclua-o na lista.
- A API do serviço só aceita chamadas vindas de Brasil, Estados Unidos, Canadá, Reino Unido, Irlanda, Alemanha, França, Portugal e Espanha, além de algumas nuvens. A documentação não cita a Cloudflare. Se o teste com `TST0001` responder erro, veja os registros com `npx wrangler tail`: o código `region_not_allowed` ou `ip_not_allowed` indica esse bloqueio, e o caminho é falar com o suporte do serviço.
- O servidor registra apenas o código de erro e o identificador da requisição, nunca a chave.
