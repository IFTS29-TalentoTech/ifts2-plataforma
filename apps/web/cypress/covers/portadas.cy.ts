/** A06: páginas reales contra una API simulada por scripts/test-public-covers.mjs. */
function loaded(selector: string) {
  cy.get(selector).scrollIntoView();
  cy.get(selector)
    .should('be.visible')
    .should(($img) => {
      const img = $img[0] as HTMLImageElement;
      expect(img.complete).to.eq(true);
      expect(img.naturalWidth).to.be.greaterThan(0);
      expect(img.getBoundingClientRect().width).to.be.at.most(
        img.ownerDocument.documentElement.clientWidth,
      );
    });
}

for (const width of [390, 1440]) {
  describe(`Portadas (${width} px)`, () => {
    beforeEach(() => {
      cy.viewport(width, 900);
      cy.intercept('GET', 'https://covers.example.test/manual.png', {
        headers: { 'content-type': 'image/png' },
        fixture: 'cover.png,null',
      });
      cy.intercept('GET', 'https://bucket.example.test/**', {
        headers: { 'content-type': 'image/png' },
        fixture: 'cover.png,null',
      });
      cy.intercept('GET', 'https://covers.example.test/ausente.png', { statusCode: 404 });
    });

    for (const route of ['/', '/novedades']) {
      it(`renderiza tarjetas propias, externas, firmadas y de Instagram en ${route}`, () => {
        cy.visit(route);
        loaded('main img[src*="/_next/image?"]');
        loaded('main img[src="https://covers.example.test/manual.png"]');
        loaded('main img[src^="https://bucket.example.test/"]');
        loaded('main img[src^="http://127.0.0.2:4100/api/v1/files/social/copia.png"]');
        cy.get('main img').each(($img) => {
          expect($img.attr('width')).to.eq('640');
          expect($img.attr('height')).to.eq('360');
          expect($img.attr('loading')).to.eq('lazy');
        });
        cy.get('main img[src*="/_next/image?"]')
          .should('have.attr', 'sizes')
          .and('contain', '50vw');
        cy.contains('a', 'Portada vencida').closest('li').scrollIntoView();
        cy.contains('a', 'Portada vencida')
          .closest('li')
          .find('[role="img"]')
          .should('have.attr', 'aria-label', 'Imagen no disponible');
        cy.contains('a', 'Portada ausente').closest('li').scrollIntoView();
        cy.contains('a', 'Portada ausente').closest('li').find('[role="img"]').should('be.visible');
        cy.contains('a', 'Portada sin').closest('li').find('img, [role="img"]').should('not.exist');
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth).to.be.at.most(width);
        });
        cy.a11y();
      });
    }

    for (const id of ['propia', 'externa', 'firmada', 'instagram']) {
      it(`muestra el detalle ${id} con prioridad y dimensiones`, () => {
        cy.visit(`/novedades/${id}`);
        loaded('article img');
        cy.get('article img')
          .should('have.attr', 'width', '1200')
          .and('have.attr', 'height', '675')
          .and('have.attr', 'alt', `Imagen de la publicación: Portada ${id}`)
          .and('not.have.attr', 'loading', 'lazy');
        if (id !== 'propia') {
          cy.get('article img').should('not.have.attr', 'srcset');
          cy.request(`/novedades/${id}`)
            .its('headers.link')
            .should('contain', 'rel=preload; as="image"');
        } else {
          cy.get('article img').should('have.attr', 'sizes', '(min-width: 768px) 768px, 100vw');
          // Con streaming, React/Next puede emitir el preload en body después de cerrar head.
          // Verificamos el hint SSR y su correspondencia con la imagen realmente cargada.
          cy.get('article img').then(($img) => {
            cy.request(`/novedades/${id}`).then(({ body }) => {
              const doc = new DOMParser().parseFromString(body, 'text/html');
              const preload = doc.querySelector('link[rel="preload"][as="image"]');
              expect(preload, 'preload de imagen en la respuesta SSR').not.to.eq(null);
              expect(preload!.getAttribute('imagesrcset')).to.eq($img.attr('srcset'));
              expect(preload!.getAttribute('imagesizes')).to.eq($img.attr('sizes'));
            });
          });
        }
        cy.contains('Contenido de la publicación.').should('be.visible');
      });
    }

    for (const id of ['vencida', 'ausente', 'sin']) {
      it(`mantiene legible el detalle con portada ${id}`, () => {
        cy.visit(`/novedades/${id}`);
        cy.get('article h1').should('contain', `Portada ${id}`);
        cy.contains('Contenido de la publicación.').should('be.visible');
        cy.get('article img').should('not.exist');
        if (id === 'sin') cy.get('article [role="img"]').should('not.exist');
        else {
          cy.get('article [role="img"]')
            .should('be.visible')
            .and(
              'have.attr',
              'aria-label',
              `Imagen de la publicación: Portada ${id}. Imagen no disponible`,
            );
        }
        cy.a11y();
      });
    }

    it('el optimizador rechaza dominios externos y URLs firmadas', () => {
      for (const src of [
        'https://covers.example.test/manual.png',
        'http://127.0.0.2:4100/api/v1/files/social/copia.png?exp=9999999999&sig=demo',
      ]) {
        cy.request({
          url: `/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`,
          failOnStatusCode: false,
        })
          .its('status')
          .should('eq', 400);
      }
    });
  });
}

export {};
