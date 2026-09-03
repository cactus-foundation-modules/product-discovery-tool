// The starter layout every flow page is designed through.
//
// Seeded and PUBLISHED on install, not left as a draft and not left to a
// hardcoded fallback page: a new layout type that ships without a published
// layout renders the fallback, and a fallback that cannot do everything the
// starter can is not an acceptable resting state. Collected by
// scripts/generate-module-layout-types.mjs through the layoutTypes entry in
// cactus.module.json.
//
// Blocks are named as strings, the way every starter does it - no import
// crosses into the Puck registry from here.

const block = (type: string, id: string, props: Record<string, unknown> = {}) => ({ type, props: { id, ...props } })

export function productDiscoveryStarters() {
  return [
    {
      id: 'starter-product-discovery',
      // The one a site is seeded with, so a flow WORKS the day it is created
      // rather than waiting on somebody to design a template first.
      publishByDefault: true,
      name: 'Heading and Guided Flow',
      description: 'The flow\'s heading and whatever you have written above it, then the wizard itself.',
      data: {
        content: [
          block('DiscoveryHeader', 'header-1', { showIntro: 'yes' }),
          block('ProductDiscovery', 'discovery-1', { columns: 3, questionsPosition: 'left', autoOpenQuestions: 'no', drawerOptions: 'side-by-side', firstStepFoot: 'hide', defaultSort: 'best-selling' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-product-discovery-bare',
      name: 'Straight into the Questions',
      description: 'No heading, no write-up - the first question is the first thing on the page.',
      data: {
        content: [block('ProductDiscovery', 'discovery-1', { columns: 3, questionsPosition: 'left', autoOpenQuestions: 'no', drawerOptions: 'side-by-side', firstStepFoot: 'hide', defaultSort: 'best-selling' })],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}
