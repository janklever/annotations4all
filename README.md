# Annotations for all (annotations4all)

Plugin do Figma que copia o conteúdo das annotations do Dev Mode para o canvas, em forma de cards numerados ao lado de cada tela. Assim, todas as pessoas com acesso ao arquivo (inclusive quem só tem permissão de visualização) conseguem ler as anotações do handoff.

## O que o plugin gera

Para cada tela que tem elementos anotados:

- **Card por annotation**, posicionado no lado da tela mais próximo do elemento (como no Dev Mode), com número, nome do elemento (clicável, leva até ele), caminho de camadas, categoria e o texto da annotation com negrito, código, listas e links preservados.
- **Propriedades** fixadas na annotation (largura, cores, padding, tipografia, componente etc.) com os valores atuais do elemento, mostrando o nome do token ou estilo quando houver.
- **Marcador numerado** sobre cada elemento, **destaque tracejado** e **linha** até o card. Cada linha ganha uma rota própria, para não se sobrepor às outras.
- **Tema claro ou escuro** para os cards. No modo automático, o plugin segue a cor de fundo da página.

Tudo fica num grupo `📝 Annotations · Nome da tela`, nas laterais da tela (dentro da mesma seção, se houver). Na interface, dá para fixar todos os cards à esquerda ou à direita, se preferir.

## Instalação (modo desenvolvimento)

1. Abra o Figma Desktop.
2. Menu **Plugins › Development › Import plugin from manifest...**
3. Selecione o arquivo `manifest.json` desta pasta.

## Como usar

1. Rode o plugin em **Plugins › Development › Annotations for all**.
2. Escolha **Página atual** ou **Seleção** (selecione as telas que quer publicar).
3. Clique em **Gerar ou atualizar**.

**Remover camadas geradas** limpa tudo o que o plugin criou na página.

## Mantendo os cards atualizados

**Com o plugin aberto (modo ao vivo):** com a opção **Acompanhar mudanças automaticamente** ligada, os cards se ajustam sozinhos quando um elemento anotado é movido, redimensionado, apagado ou tem a annotation editada. Também vale para a tela inteira sendo movida e para annotations novas.

**Com o plugin fechado:** depois da primeira geração, aparece o botão **Atualizar annotations** no painel lateral. Ele fica visível ao selecionar uma tela com cards ou com nada selecionado na página. Um clique reposiciona e atualiza tudo, sem abrir a interface. Qualquer pessoa com permissão de edição vê esse botão.

## Bom saber

- Interface bilíngue (Português e Inglês): detecta automaticamente o idioma do Figma / sistema, permitindo alternar a qualquer momento pelo topo da janela.
- Plugins do Figma não rodam em segundo plano. Sem o plugin aberto, a atualização é feita pelo botão **Atualizar annotations**.
- Cada atualização automática entra no histórico de desfazer. Ao usar Cmd+Z / Ctrl+Z logo depois de mover um elemento, a primeira volta desfaz a atualização dos cards.
- Precisa de permissão de edição no arquivo para gerar os cards (quem só visualiza consegue ler, mas não gerar).
- As camadas geradas vêm travadas por padrão para ninguém mexer sem querer. Dá para desligar isso na interface.
- Measurements (medidas entre elementos) ainda não são replicadas.
- Usa a fonte Inter, que já vem no Figma.

## Para publicar na organização

Troque o `id` do `manifest.json` pelo ID gerado pelo Figma ao criar o plugin em **Plugins › Development › New plugin...** e publique como plugin privado da organização ou na comunidade. O ícone e os assets de apresentação são configurados no painel de publicação do Figma.

## Desenvolvimento

Para ter suporte a autocomplete e tipagens da API do Figma no seu editor (VS Code, Cursor, etc.):

```bash
npm install
npm run typecheck
```

### Estrutura de arquivos

- `manifest.json`: Manifesto de configuração do plugin Figma.
- `code.js`: Lógica principal do plugin executada no sandbox do Figma (leitura de annotations, criação de nós e renderização de cards).
- `ui.html`: Interface visual (HTML/CSS/JS) exibida no modal do plugin.
- `assets/`: Ícones e recursos visuais do plugin.
- `jsconfig.json`: Configuração do TypeScript Language Server com `@figma/plugin-typings`.
