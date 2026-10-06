# Dashboard de Cartão de Crédito Corporativo

Dashboard analítico em HTML/JavaScript puro para controle de gastos com cartão de crédito corporativo. Lê uma planilha `.xlsx` diretamente no navegador (sem backend) e apresenta KPIs, gráficos, árvore de decomposição, insights automáticos e ranking de lançamentos.

> **Aviso:** todos os dados deste repositório são **100% fictícios**, gerados por script. Nomes, valores, departamentos e cartões são inventados e não representam nenhuma organização real.

## Funcionalidades

- Filtros combinados: ano, mês, bandeira, cartão, natureza, departamento e status.
- KPIs: gasto total, ticket médio, último mês (variação vs. mês anterior), maior departamento, maior natureza e média mensal.
- Gráficos: evolução mensal com média móvel de 3 meses, composição por natureza, ranking por departamento, bandeira, status e acumulado no período.
- Árvore de decomposição interativa: Ano → Departamento → Natureza → Descrição.
- Insights automáticos: tendência, concentração, anomalias (acima de 2 desvios-padrão), pendências de validação e comparativo entre cartões.
- Leitura de arquivo/pasta via File System Access API com atualização automática (navegadores Chromium), cache local e arrastar-e-soltar.
- Modo demonstração: quando servido por HTTP, carrega automaticamente `dados_exemplo/base_de_dados.xlsx`.

## Tecnologias

HTML5, CSS3, JavaScript (ES2020), [Chart.js](https://www.chartjs.org/) 4.4 e [SheetJS (xlsx)](https://sheetjs.com/) 0.18, ambos carregados via CDN (cdnjs). Python 3 + openpyxl apenas para gerar os dados de exemplo.

## Como executar

Requer **internet** (as bibliotecas vêm de CDN). Para uso offline, baixe `xlsx.full.min.js` e `chart.umd.min.js` do cdnjs, salve em `js/vendor/` e ajuste as tags `<script>` do `index.html`.

```bash
python gerar_dados_exemplo.py     # opcional: o .xlsx de exemplo já está incluído
python -m http.server 8812
# abra http://localhost:8812
```

Para usar seus próprios dados, clique em "Abrir .xlsx" ou "Pasta da base" (ou arraste o arquivo). A planilha deve ter a primeira aba com as colunas:
`Núm_Mês, Mês, Ano, Data, Bandeira, Cartão, Natureza, Descrição, Valor, Departamento, Status`.

## Estrutura

```
index.html                  Página principal
css/theme.css               Tema visual
js/core.js                  Estado, leitura do XLSX, persistência e filtros
js/views.js                 Gráficos, KPIs, árvore, insights e tabela
js/app.js                   Eventos de interface e carga inicial
gerar_dados_exemplo.py      Gerador de dados fictícios (seed fixa)
dados_exemplo/              Planilha sintética gerada
```

## Gerar dados de exemplo

```bash
pip install openpyxl
python gerar_dados_exemplo.py
```

Cria ~220 lançamentos fictícios dos últimos 6 meses em `dados_exemplo/base_de_dados.xlsx` (seed fixa, resultado reproduzível nos valores; as datas são relativas ao dia da execução).

## Licença

MIT — veja [LICENSE](LICENSE).
