# Identificação canônica de médicos no financeiro

## Contrato

- A coleção global `doctors` é a fonte de identidade dos médicos.
- O identificador canônico é o ID do documento Firestore em `doctors/{doctorId}`. Ele é uma string; não converter para inteiro.
- `doctorName` é um campo de exibição e compatibilidade, não uma chave.
- `financial_transactions.doctorId` e `doctor_provider_mappings.doctorId` devem apontar para o ID do documento em `doctors`.
- `financial_team_settings.doctors[].key` continua sendo a chave de configuração/rateio (por exemplo, `thais`), não o ID canônico. A configuração financeira continua responsável pelos pesos de rateio.

## Escrita de lançamentos

1. O formulário lê médicos ativos de `doctors` e envia o ID real do documento selecionado.
2. O backend valida que o ID enviado existe em `doctors`.
3. O backend salva esse ID em `financial_transactions.doctorId` e usa o nome atual do documento como `doctorName`.
4. O tipo de lançamento continua sendo a fonte da verdade para `nature`, `scope` e `rateioMethod`. O ID do médico não pode transformar um tipo de equipe em individual.

## Leitura da matriz

1. A matriz resolve primeiro IDs canônicos contra os documentos carregados de `doctors`.
2. A configuração financeira é encontrada pelo nome normalizado para obter pesos e regras de rateio.
3. Slugs antigos como `thais` e nomes antigos continuam aceitos como compatibilidade de leitura.
4. Para despesas individuais, 100% do valor vai para o médico resolvido. Se o ID não for resolvido, a transação é registrada no console como pendência e não é rateada silenciosamente entre a equipe.

## Migração segura

- Não renomear nem recriar documentos existentes em `doctors`.
- Não converter IDs de documentos em inteiros.
- Antes de migrar lançamentos históricos, gerar um relatório somente leitura com `transactionId`, `closingId`, `doctorId`, `doctorName`, `typeId`, `typeName` e resultado da resolução.
- Atualizar apenas documentos com correspondência inequívoca; manter os demais como pendências para revisão.
- Não alterar Firestore Rules até que haja evidência de que uma falha de autorização está causando o problema.

## Diagnóstico da despesa Google de Thaís

Para o lançamento de R$ 1.212,00, conferir no mesmo documento: `closingId` da competência, `doctorId` (ID de `doctors`), `doctorName`, `scope` igual a `DOCTOR`, `typeId` e `nature` igual a `DEBIT`. A matriz deve resolver o ID para Thaís e usar o mesmo `typeId` para a coluna Google.
