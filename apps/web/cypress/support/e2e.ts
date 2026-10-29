import 'cypress-axe';

declare global {
  namespace Cypress {
    interface Chainable {
      /** Inyecta axe y falla ante violaciones serias o críticas (WCAG 2.2 AA). */
      a11y(): Chainable<void>;
    }
  }
}

Cypress.Commands.add('a11y', () => {
  cy.injectAxe();
  cy.checkA11y(
    undefined,
    {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      includedImpacts: ['serious', 'critical'],
    },
    (violations) => {
      cy.task(
        'log',
        violations
          .map(
            (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
          )
          .join('\n'),
        { log: false },
      );
    },
  );
});
