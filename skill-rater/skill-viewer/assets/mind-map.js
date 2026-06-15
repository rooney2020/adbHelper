(function () {
  const MAX_REFERENCE_DEPTH = 2;
  const BASE_ZOOM = 0.8;
  const DEFAULT_DETAIL_WIDTH = null;
  const MIN_DETAIL_WIDTH = 320;
  const MIN_MAP_WIDTH = 480;
  const NODE_META = {
    root: "根文件",
    reference: "引用文件",
    heading: "文件章节",
  };

  function createRuntime(host) {
    const runtimeState = {
      cacheKey: "",
      rootPath: "",
      model: null,
      selectedNodeId: "",
      collapsedIds: new Set(),
      zoom: BASE_ZOOM,
      detailWidth: DEFAULT_DETAIL_WIDTH,
      detailWidthCustomized: false,
      cleanup: null,
    };

    return {
      reset,
      async render(container, options = {}) {
        if (typeof runtimeState.cleanup === 'function') {
          runtimeState.cleanup();
          runtimeState.cleanup = null;
        }

        const currentFilePath = options.currentFilePath || "";
        const model = await getModel(currentFilePath);
        if (!model?.rootNode) {
          container.className = "document-view empty-state";
          container.textContent = "当前目录下没有可以生成导图的入口文件。";
          return;
        }

        if (!runtimeState.selectedNodeId || !model.nodeIndex.has(runtimeState.selectedNodeId)) {
          runtimeState.selectedNodeId = model.primaryNodeIdByFile.get(currentFilePath) || model.rootNode.id;
        }

        const detailWidthStyle = Number.isFinite(runtimeState.detailWidth)
          ? ` style="--mindmap-detail-width: ${runtimeState.detailWidth}px;"`
          : "";

        container.className = "document-view mindmap-mode";
        container.innerHTML = `
          <div class="mindmap-shell"${detailWidthStyle}>
            <section class="mindmap-map-panel">
              <div class="mindmap-toolbar">
                <div>
                  <div class="mindmap-toolbar-label">当前导图根节点</div>
                  <div class="mindmap-toolbar-value">${host.escapeHtml(model.rootPath)}</div>
                </div>
                <div class="mindmap-toolbar-actions">
                  <button type="button" class="ghost-button" data-mindmap-action="zoom-out">缩小</button>
                  <button type="button" class="ghost-button" data-mindmap-action="zoom-reset">重置</button>
                  <button type="button" class="ghost-button" data-mindmap-action="zoom-in">放大</button>
                  <span class="mindmap-zoom-value">${formatZoomLabel(runtimeState.zoom)}</span>
                </div>
              </div>
              <div class="mindmap-map-wrap" data-mindmap-role="wrap">
                <div class="mindmap-viewport" data-mindmap-role="viewport">
                  <div class="mindmap-canvas" data-mindmap-role="canvas"></div>
                </div>
              </div>
            </section>
            <div
              class="mindmap-splitter"
              data-mindmap-role="splitter"
              role="separator"
              aria-label="拖拽调整导图与详情宽度"
              aria-orientation="vertical"
              tabindex="0"
            ></div>
            <aside class="mindmap-detail-panel">
              <div class="mindmap-detail-head">
                <div class="mindmap-detail-state" data-mindmap-role="state"></div>
                <h3 class="mindmap-detail-title" data-mindmap-role="title"></h3>
                <div class="mindmap-detail-meta" data-mindmap-role="meta"></div>
              </div>
              <div class="mindmap-detail-body" data-mindmap-role="body"></div>
            </aside>
          </div>
        `;

        await bindInteractions(container, model, options);
      },
    };

    function reset() {
      if (typeof runtimeState.cleanup === 'function') {
        runtimeState.cleanup();
      }
      runtimeState.cacheKey = "";
      runtimeState.rootPath = "";
      runtimeState.model = null;
      runtimeState.selectedNodeId = "";
      runtimeState.collapsedIds.clear();
      runtimeState.zoom = BASE_ZOOM;
      runtimeState.detailWidth = DEFAULT_DETAIL_WIDTH;
      runtimeState.detailWidthCustomized = false;
      runtimeState.cleanup = null;
    }

    async function getModel(currentFilePath) {
      const rootPath = host.getMindMapRootPath(currentFilePath);
      if (!rootPath) {
        reset();
        return null;
      }

      const cacheKey = `${rootPath}::${host.listPaths().sort().join("|")}`;
      if (runtimeState.model && runtimeState.cacheKey === cacheKey) {
        return runtimeState.model;
      }

      const model = await buildModel(rootPath);
      runtimeState.cacheKey = cacheKey;
      runtimeState.rootPath = rootPath;
      runtimeState.model = model;
      runtimeState.collapsedIds = new Set();
      primeCollapsed(model.rootNode);
      runtimeState.selectedNodeId = model.rootNode.id;
      return model;
    }

    function primeCollapsed(node) {
      if (node.depth >= 2 && node.children.length) {
        runtimeState.collapsedIds.add(node.id);
      }
      node.children.forEach(primeCollapsed);
    }

    async function buildModel(rootPath) {
      const nodeIndex = new Map();
      const primaryNodeIdByFile = new Map();

      const rootNode = await buildFileNode({
        filePath: rootPath,
        parentId: "",
        relationType: "root",
        referenceDepth: 0,
        ancestry: new Set([rootPath]),
      });
      assignDepth(rootNode, 0);
      return { rootPath, rootNode, nodeIndex, primaryNodeIdByFile };

      async function buildFileNode({ filePath, parentId, relationType, referenceDepth, ancestry }) {
        const nodeId = parentId ? `${parentId}::${relationType}:${filePath}` : `root:${filePath}`;
        const node = {
          id: nodeId,
          kind: relationType === "root" ? "root" : "reference",
          label: filePath,
          filePath,
          children: [],
          detailType: "file",
          depth: 0,
        };
        nodeIndex.set(nodeId, node);
        if (!primaryNodeIdByFile.has(filePath)) {
          primaryNodeIdByFile.set(filePath, nodeId);
        }

        if (!host.isMarkdownFile(filePath)) {
          return node;
        }

        const content = await host.readFile(filePath);
        const { body } = host.splitFrontmatter(content);
        const outline = extractHeadingOutline(body);

        if (outline.topLevel.length) {
          for (const heading of outline.topLevel) {
            node.children.push(await buildHeadingNode({
              filePath,
              parentId: nodeId,
              heading,
              referenceDepth,
              ancestry,
            }));
          }
          return node;
        }

        node.children = await buildReferenceNodes({
          markdown: body,
          currentFilePath: filePath,
          parentId: nodeId,
          referenceDepth,
          ancestry,
        });
        return node;
      }

      async function buildHeadingNode({ filePath, parentId, heading, referenceDepth, ancestry }) {
        const nodeId = `${parentId}::heading:${heading.anchor}`;
        const node = {
          id: nodeId,
          kind: "heading",
          label: heading.label,
          filePath,
          sectionContent: heading.sectionContent,
          children: [],
          detailType: "heading",
          depth: 0,
        };
        nodeIndex.set(nodeId, node);

        for (const childHeading of heading.children) {
          node.children.push(await buildHeadingNode({
            filePath,
            parentId: nodeId,
            heading: childHeading,
            referenceDepth,
            ancestry,
          }));
        }

        const referenceChildren = await buildReferenceNodes({
          markdown: heading.sectionContent,
          currentFilePath: filePath,
          parentId: nodeId,
          referenceDepth,
          ancestry,
        });
        node.children.push(...referenceChildren);
        return node;
      }

      async function buildReferenceNodes({ markdown, currentFilePath, parentId, referenceDepth, ancestry }) {
        const references = host.extractReferences(markdown, currentFilePath);
        const seen = new Set();
        const children = [];

        for (const reference of references) {
          const resolved = host.resolveReference(reference.raw, currentFilePath);
          if (resolved.type !== "file" || seen.has(resolved.path)) {
            continue;
          }
          seen.add(resolved.path);

          const nextAncestry = new Set(ancestry);
          if (nextAncestry.has(resolved.path)) {
            children.push({
              id: `${parentId}::cycle:${resolved.path}`,
              kind: "reference",
              label: resolved.path,
              filePath: resolved.path,
              children: [],
              detailType: "file",
              depth: 0,
              note: "检测到循环引用，已停止继续展开。",
            });
            continue;
          }

          nextAncestry.add(resolved.path);
          if (referenceDepth >= MAX_REFERENCE_DEPTH) {
            children.push({
              id: `${parentId}::leaf:${resolved.path}`,
              kind: "reference",
              label: resolved.path,
              filePath: resolved.path,
              children: [],
              detailType: "file",
              depth: 0,
              note: "达到导图自动展开深度上限。",
            });
            continue;
          }

          children.push(await buildFileNode({
            filePath: resolved.path,
            parentId,
            relationType: `ref-${children.length + 1}`,
            referenceDepth: referenceDepth + 1,
            ancestry: nextAncestry,
          }));
        }

        return children;
      }
    }

    async function bindInteractions(container, model, options) {
      const shell = container.querySelector('.mindmap-shell');
      const wrap = container.querySelector('[data-mindmap-role="wrap"]');
      const viewport = container.querySelector('[data-mindmap-role="viewport"]');
      const canvas = container.querySelector('[data-mindmap-role="canvas"]');
      const splitter = container.querySelector('[data-mindmap-role="splitter"]');
      const stateLabel = container.querySelector('[data-mindmap-role="state"]');
      const detailTitle = container.querySelector('[data-mindmap-role="title"]');
      const detailMeta = container.querySelector('[data-mindmap-role="meta"]');
      const detailBody = container.querySelector('[data-mindmap-role="body"]');
      let dragState = null;
      let resizeState = null;
      let detailToken = 0;
      let canvasWidth = 0;
      let canvasHeight = 0;

      const clampDetailWidth = (width) => {
        const shellWidth = shell?.clientWidth || 0;
        const splitterWidth = splitter?.offsetWidth || 18;
        const maxWidth = shellWidth ? Math.max(MIN_DETAIL_WIDTH, shellWidth - MIN_MAP_WIDTH - splitterWidth) : width;
        return Math.min(Math.max(width, MIN_DETAIL_WIDTH), maxWidth);
      };

      const getBalancedDetailWidth = () => {
        const shellWidth = shell?.clientWidth || 0;
        const splitterWidth = splitter?.offsetWidth || 18;
        if (!shellWidth) {
          return MIN_DETAIL_WIDTH;
        }
        return (shellWidth - splitterWidth) / 2;
      };

      const getPreferredDetailWidth = () => {
        if (runtimeState.detailWidthCustomized && Number.isFinite(runtimeState.detailWidth)) {
          return runtimeState.detailWidth;
        }
        return getBalancedDetailWidth();
      };

      const applyDetailWidth = (width) => {
        runtimeState.detailWidth = clampDetailWidth(width);
        shell.style.setProperty('--mindmap-detail-width', `${runtimeState.detailWidth}px`);
        if (splitter) {
          splitter.setAttribute('aria-valuenow', String(Math.round(runtimeState.detailWidth)));
        }
      };

      const renderGraph = () => {
        assignPositions(model.rootNode, { cursor: 0 });
        const visibleNodes = collectVisible(model.rootNode, []);
        canvas.innerHTML = '<svg class="mindmap-links" data-mindmap-role="links"></svg>';
        const links = canvas.querySelector('[data-mindmap-role="links"]');

        for (const node of visibleNodes) {
          const element = createNodeElement(node, {
            onSelect: async () => {
              runtimeState.selectedNodeId = node.id;
              updateSelection(container, model);
              await renderDetail();
              if (node.filePath && node.filePath !== options.currentFilePath && typeof options.onOpenFile === 'function') {
                await options.onOpenFile(node.filePath);
              }
            },
            onToggle: () => {
              if (runtimeState.collapsedIds.has(node.id)) {
                runtimeState.collapsedIds.delete(node.id);
              } else {
                runtimeState.collapsedIds.add(node.id);
              }
              renderGraph();
            },
          });
          canvas.appendChild(element);
        }

        captureMeasurements(canvas, visibleNodes);
        assignPositions(model.rootNode, { cursor: 0 });
        const bounds = computeCanvasBounds(visibleNodes);
        canvasWidth = bounds.width;
        canvasHeight = bounds.height;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
        links.setAttribute('width', String(canvasWidth));
        links.setAttribute('height', String(canvasHeight));
        links.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
        viewport.style.width = `${canvasWidth * runtimeState.zoom}px`;
        viewport.style.height = `${canvasHeight * runtimeState.zoom}px`;

        for (const node of visibleNodes) {
          const element = canvas.querySelector(`[data-node-id="${cssEscape(node.id)}"]`);
          if (!element) {
            continue;
          }
          element.style.left = `${node.x}px`;
          element.style.top = `${node.y}px`;
        }

        drawLinks(links, visibleNodes, canvas);
        applyZoom();
        updateSelection(container, model);
      };

      const applyZoom = () => {
        canvas.style.transform = `scale(${runtimeState.zoom})`;
        viewport.style.width = `${canvasWidth * runtimeState.zoom}px`;
        viewport.style.height = `${canvasHeight * runtimeState.zoom}px`;
        const zoomLabel = container.querySelector('.mindmap-zoom-value');
        if (zoomLabel) {
          zoomLabel.textContent = formatZoomLabel(runtimeState.zoom);
        }
      };

      const renderDetail = async () => {
        const node = model.nodeIndex.get(runtimeState.selectedNodeId) || model.rootNode;
        const token = ++detailToken;
        stateLabel.textContent = `当前节点：${NODE_META[node.kind] || '节点'}`;
        detailTitle.textContent = node.label;
        const chips = [NODE_META[node.kind] || '节点', node.filePath];
        if (node.children.length) {
          chips.push(`下一级 ${node.children.length} 项`);
        }
        if (node.note) {
          chips.push(node.note);
        }
        detailMeta.innerHTML = chips.map((chip) => `<span class="mindmap-detail-chip">${host.escapeHtml(chip)}</span>`).join('');
        detailBody.innerHTML = '<div class="empty-state">正在加载节点详情...</div>';
        const detailHtml = await host.renderNodeDetail(node);
        if (token !== detailToken) {
          return;
        }
        detailBody.innerHTML = detailHtml || '<div class="empty-state">当前节点没有可展示的正文。</div>';
      };

      const stopResize = (event) => {
        if (!resizeState || resizeState.pointerId !== event.pointerId) {
          return;
        }
        shell.classList.remove('is-resizing');
        if (splitter?.hasPointerCapture(event.pointerId)) {
          splitter.releasePointerCapture(event.pointerId);
        }
        resizeState = null;
      };

      container.addEventListener('click', (event) => {
        const actionTrigger = event.target.closest('[data-mindmap-action]');
        if (!actionTrigger) {
          return;
        }

        const action = actionTrigger.dataset.mindmapAction;
        if (action === 'zoom-in') {
          runtimeState.zoom = clampZoom(runtimeState.zoom + BASE_ZOOM * 0.12);
          applyZoom();
        } else if (action === 'zoom-out') {
          runtimeState.zoom = clampZoom(runtimeState.zoom - BASE_ZOOM * 0.12);
          applyZoom();
        } else if (action === 'zoom-reset') {
          runtimeState.zoom = BASE_ZOOM;
          applyZoom();
        }
      });

      wrap.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('[data-select-node-id], [data-toggle-node-id], [data-mindmap-action]')) {
          return;
        }
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: wrap.scrollLeft,
          scrollTop: wrap.scrollTop,
        };
        wrap.classList.add('dragging');
        wrap.setPointerCapture(event.pointerId);
      });

      wrap.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }
        wrap.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
        wrap.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY);
      });

      const stopDrag = (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }
        wrap.classList.remove('dragging');
        if (wrap.hasPointerCapture(event.pointerId)) {
          wrap.releasePointerCapture(event.pointerId);
        }
        dragState = null;
      };

      wrap.addEventListener('pointerup', stopDrag);
      wrap.addEventListener('pointercancel', stopDrag);

      if (splitter) {
        splitter.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) {
            return;
          }
          resizeState = {
            pointerId: event.pointerId,
          };
          shell.classList.add('is-resizing');
          splitter.setPointerCapture(event.pointerId);
          event.preventDefault();
        });

        splitter.addEventListener('pointermove', (event) => {
          if (!resizeState || resizeState.pointerId !== event.pointerId) {
            return;
          }
          const shellBounds = shell.getBoundingClientRect();
          const nextWidth = shellBounds.right - event.clientX;
          runtimeState.detailWidthCustomized = true;
          applyDetailWidth(nextWidth);
        });

        splitter.addEventListener('pointerup', stopResize);
        splitter.addEventListener('pointercancel', stopResize);
        splitter.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return;
          }
          const delta = event.key === 'ArrowLeft' ? 24 : -24;
          runtimeState.detailWidthCustomized = true;
          applyDetailWidth(runtimeState.detailWidth + delta);
          event.preventDefault();
        });
      }

      let resizeObserver = null;
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
          applyDetailWidth(getPreferredDetailWidth());
        });
        resizeObserver.observe(shell);
      }

      runtimeState.cleanup = () => {
        shell.classList.remove('is-resizing');
        resizeObserver?.disconnect();
      };

      applyDetailWidth(getPreferredDetailWidth());
      renderGraph();
      await renderDetail();
    }

    function updateSelection(container, model) {
      const nodes = container.querySelectorAll('[data-select-node-id]');
      for (const nodeElement of nodes) {
        nodeElement.classList.toggle('active', nodeElement.dataset.selectNodeId === runtimeState.selectedNodeId);
      }
      if (!model.nodeIndex.has(runtimeState.selectedNodeId)) {
        runtimeState.selectedNodeId = model.rootNode.id;
      }
    }

    function assignDepth(node, depth) {
      node.depth = depth;
      node.children.forEach((child) => assignDepth(child, depth + 1));
    }

    function visibleChildren(node) {
      return runtimeState.collapsedIds.has(node.id) ? [] : node.children;
    }

    function collectVisible(node, list) {
      list.push(node);
      visibleChildren(node).forEach((child) => collectVisible(child, list));
      return list;
    }

    function assignPositions(node, tracker) {
      const children = visibleChildren(node);
      if (!children.length) {
        const units = getNodeUnits(node);
        tracker.cursor += units / 2;
        node.y = 60 + tracker.cursor * 28;
        tracker.cursor += units / 2 + 0.5;
      } else {
        children.forEach((child, index) => {
          assignPositions(child, tracker);
          if (index < children.length - 1) {
            tracker.cursor += 0.35;
          }
        });
        node.y = children.length === 1 ? children[0].y : (children[0].y + children[children.length - 1].y) / 2;
      }
      node.x = 200 + node.depth * 290;
    }

    function getNodeUnits(node) {
      if (node.measuredHeight) {
        return node.measuredHeight / 28;
      }
      const wrapChars = { root: 13, reference: 18, heading: 16 };
      const baseUnits = { root: 3.2, reference: 2.5, heading: 2.1 };
      const rows = Math.max(1, Math.ceil(String(node.label || '').length / (wrapChars[node.kind] || 16)));
      return Math.max(baseUnits[node.kind] || 2.2, rows * 0.96 + 0.9);
    }

    function computeCanvasBounds(visibleNodes) {
      let maxX = 0;
      let maxY = 0;
      for (const node of visibleNodes) {
        const width = node.measuredWidth || (node.kind === 'root' ? 300 : 248);
        const height = node.measuredHeight || 72;
        maxX = Math.max(maxX, node.x + width / 2 + 120);
        maxY = Math.max(maxY, node.y + height / 2 + 80);
      }
      return { width: maxX, height: maxY };
    }

    function captureMeasurements(canvas, visibleNodes) {
      for (const node of visibleNodes) {
        const element = canvas.querySelector(`[data-node-id="${cssEscape(node.id)}"] .mindmap-node-card`);
        if (!element) {
          continue;
        }
        node.measuredHeight = element.offsetHeight;
        node.measuredWidth = element.offsetWidth;
      }
    }

    function drawLinks(svg, visibleNodes, canvas) {
      svg.innerHTML = '';
      for (const node of visibleNodes) {
        const children = visibleChildren(node);
        if (!children.length) {
          continue;
        }
        const parentCard = canvas.querySelector(`[data-node-id="${cssEscape(node.id)}"] .mindmap-node-card`);
        const parentHalfWidth = parentCard ? parentCard.offsetWidth / 2 : 120;
        const parentRight = node.x + parentHalfWidth;

        for (const child of children) {
          const childCard = canvas.querySelector(`[data-node-id="${cssEscape(child.id)}"] .mindmap-node-card`);
          const childHalfWidth = childCard ? childCard.offsetWidth / 2 : 110;
          const childLeft = child.x - childHalfWidth;
          const midX = parentRight + (childLeft - parentRight) / 2;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${parentRight} ${node.y} C ${midX} ${node.y}, ${midX} ${child.y}, ${childLeft} ${child.y}`);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'rgba(53, 41, 30, 0.62)');
          path.setAttribute('stroke-width', child.kind === 'heading' ? '2.4' : '3');
          path.setAttribute('stroke-linecap', 'round');
          svg.appendChild(path);
        }
      }
    }

    function createNodeElement(node, handlers) {
      const wrap = document.createElement('div');
      wrap.className = `mindmap-node ${node.kind}`;
      wrap.dataset.nodeId = node.id;
      wrap.style.left = `${node.x}px`;
      wrap.style.top = `${node.y}px`;
      wrap.innerHTML = `
        <button type="button" class="mindmap-node-hit" data-select-node-id="${host.escapeHtmlAttribute(node.id)}">
          <div class="mindmap-node-card">
            <span class="mindmap-node-kicker">${host.escapeHtml(NODE_META[node.kind] || '节点')}</span>
            <span class="mindmap-node-title">${host.escapeHtml(node.label)}</span>
          </div>
        </button>
      `;

      const selectButton = wrap.querySelector('[data-select-node-id]');
      if (selectButton) {
        selectButton.addEventListener('click', handlers.onSelect);
      }

      if (node.children.length) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'mindmap-fold-toggle';
        toggle.dataset.toggleNodeId = node.id;
        toggle.textContent = runtimeState.collapsedIds.has(node.id) ? '+' : '−';
        toggle.setAttribute('aria-label', runtimeState.collapsedIds.has(node.id) ? '展开节点' : '折叠节点');
        toggle.addEventListener('click', (event) => {
          event.stopPropagation();
          handlers.onToggle();
        });
        wrap.appendChild(toggle);
      }

      return wrap;
    }
  }

  function extractHeadingOutline(markdown) {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const headings = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(#{2,3})\s+(.*)$/);
      if (!match) {
        return;
      }
      headings.push({
        level: match[1].length,
        label: match[2].trim(),
        startLine: index,
        anchor: `${index}-${slugify(match[2].trim())}`,
      });
    });

    if (!headings.length) {
      return { topLevel: [] };
    }

    const enriched = headings.map((heading, index) => ({
      ...heading,
      sectionContent: lines.slice(heading.startLine, index + 1 < headings.length ? headings[index + 1].startLine : lines.length).join('\n').trim(),
      children: [],
    }));

    const topLevel = [];
    let currentLevel2 = null;
    for (const heading of enriched) {
      if (heading.level === 2 || !currentLevel2) {
        topLevel.push(heading);
        currentLevel2 = heading.level === 2 ? heading : currentLevel2;
        continue;
      }
      currentLevel2.children.push(heading);
    }

    return { topLevel };
  }

  function clampZoom(value) {
    return Math.min(BASE_ZOOM * 1.8, Math.max(BASE_ZOOM * 0.58, value));
  }

  function formatZoomLabel(zoom) {
    return `${Math.round((zoom / BASE_ZOOM) * 100)}%`;
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  window.SkillMindMap = {
    createRuntime,
  };
})();