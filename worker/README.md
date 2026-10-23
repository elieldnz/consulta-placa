# Servidor intermediário da consulta de placa

A página não pode chamar a API de placas direto, porque os tokens ficariam visíveis para qualquer visitante. Este pequeno servidor (Cloudflare Worker) guarda os tokens, consulta a [APIBrasil](https://apibrasil.io) ("API Placa Dados") e devolve só os dados que a página mostra.

## Como colocar no ar

1. **Crie a conta na APIBrasil** (app.apibrasil.io). Em **Minhas APIs → API Placa Dados**, copie o **DeviceToken** e o **BearerToken**. O plano gratuito costuma ter 100 consultas por dia (confirme no painel).
2. **Teste a API no seu computador antes de subir o servidor.** Troque os valores e rode:

   ```
   curl -X POST https://gateway.apibrasil.io/api/v2/vehicles/dados \
     -H "Content-Type: application/json" \
     -H "DeviceToken: SEU_DEVICE_TOKEN" \
     -H "Authorization: Bearer SEU_BEARER_TOKEN" \
     -d '{"placa":"ABC1D23"}'
   ```

   Use uma placa real. A resposta mostra os campos que a API devolve. **Cole essa resposta para mim, apagando qualquer token:** a documentação pública não mostra o formato, e eu ajusto a leitura dos campos (`mapear` em `index.js`) para bater com ele.
3. **Crie uma conta na Cloudflare** (o plano gratuito basta) e, nesta pasta (`worker`), rode:

   ```
   npx wrangler login
   npx wrangler secret put APIBRASIL_DEVICE_TOKEN
   npx wrangler secret put APIBRASIL_BEARER_TOKEN
   npx wrangler deploy
   ```

   Cada `secret put` pede o valor; cole e confirme. O `deploy` mostra o endereço do servidor, algo como `https://consulta-placa-api.SEU-USUARIO.workers.dev`.
4. **Teste o servidor** (troque pelo seu endereço):

   ```
   curl -H "Origin: https://elieldnz.github.io" "https://consulta-placa-api.SEU-USUARIO.workers.dev/?placa=ABC1D23"
   ```

5. **Ligue a página:** em `index.html`, coloque esse endereço em `API_URL` e publique.

## Cuidados

- Só as páginas listadas em `ALLOWED_ORIGINS` (`wrangler.toml`) conseguem usar o servidor. Se publicar o site em outro endereço, inclua-o na lista.
- O limite gratuito é por conta, e a página é pública: qualquer visitante gasta as suas consultas. Se o limite acabar, a página mostra "serviço indisponível".
- O servidor registra apenas o status e os nomes dos campos da resposta, nunca os tokens nem os dados do veículo. Para ver os registros: `npx wrangler tail`.
