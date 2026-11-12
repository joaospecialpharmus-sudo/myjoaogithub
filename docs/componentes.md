# Componentes candidatos

Consulta inicial às licenças nos repositórios oficiais no GitHub:

- https://github.com/mozilla/pdf.js — Apache-2.0. Candidato para extrair texto de PDFs no navegador. PDFs digitalizados exigirão OCR; cada banco precisa de validação com exemplos anonimizados.
- https://github.com/papaparse/papaparse — MIT. Candidato para leitura de CSV, com mapeamento de colunas e revisão antes de persistir.

PDF.js foi incorporado via pacote pdfjs-dist para leitura local de PDFs; Papa Parse ainda não foi incorporado. A consulta às licenças não substitui avaliação de manutenção, segurança, versão e compatibilidade antes da adoção. Não há integração com APIs bancárias nesta versão.
