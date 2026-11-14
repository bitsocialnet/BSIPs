// @ts-check
import { render } from 'pele';

// Render ```mermaid blocks to static SVG at build time with Pele, so diagrams need no client
// script. Colors come from the --pele-* variables in global.css and follow the site theme.

// The prose column (44rem) minus the .diagram padding, so diagrams lay out at their display size.
const MAX_WIDTH = 672;
// Never shrink a diagram below this scale inline (16px labels stay at least 12px); a wider diagram
// scrolls sideways instead, and the expand button opens it full screen with zoom.
const MIN_SCALE = 0.75;
// Lucide maximize-2 (ISC).
const EXPAND_ICON =
  '<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>';

export default function remarkPele() {
  return (tree, file) => {
    let count = 0;
    const walk = (node, index, parent) => {
      if (node.type === 'code' && node.lang === 'mermaid' && parent) {
        const idPrefix = `diagram-${++count}`;
        try {
          const { svg, width } = render(node.value, { idPrefix, maxWidth: MAX_WIDTH });
          // min-width wins over the max-width:100% Pele puts on the SVG.
          const sized = svg.replace('style="', `style="min-width:${Math.round(width * MIN_SCALE)}px;`);
          parent.children[index] = {
            type: 'html',
            value:
              `<figure class="diagram"><div class="diagram-scroll">${sized}</div>` +
              `<button type="button" class="diagram-expand" data-diagram-expand hidden aria-label="Expand diagram" title="Expand diagram">${EXPAND_ICON}</button></figure>`,
          };
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
