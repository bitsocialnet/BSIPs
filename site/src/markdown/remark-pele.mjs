// @ts-check
import { render } from 'pele';

// Render ```mermaid blocks to static SVG at build time with Pele, so diagrams need no client
// script. Colors come from the --pele-* variables in global.css and follow the site theme.

// The prose column (44rem) minus the .diagram padding, so diagrams lay out at their display size.
const MAX_WIDTH = 672;

export default function remarkPele() {
  return (tree, file) => {
    let count = 0;
    const walk = (node, index, parent) => {
      if (node.type === 'code' && node.lang === 'mermaid' && parent) {
        const idPrefix = `diagram-${++count}`;
        try {
          const { svg } = render(node.value, { idPrefix, maxWidth: MAX_WIDTH });
          parent.children[index] = { type: 'html', value: `<figure class="diagram">${svg}</figure>` };
        } catch (error) {
          throw new Error(`Could not render the mermaid diagram in ${file.path}: ${error.message}`);
        }
        return;
      }
      node.children?.forEach((child, i) => walk(child, i, node));
    };
    walk(tree);
  };
}
