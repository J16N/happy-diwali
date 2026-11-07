// The crackers offered in the selection wheel. Inner ring: things you set
// down on the terrace. Outer ring: things that go up into the sky.
// Icons are 24x24 line drawings in the page's gold, coloured by CSS.

export const GROUND = [
  { id: 'anar', label: 'Anar', hint: 'Flowerpot fountain',
    icon: '<path d="M9 21h6l-1.6-7h-2.8z"/><path d="M12 13c-2-3-4-5-6-6M12 13c2-3 4-5 6-6M12 12V5"/><circle cx="6" cy="6" r=".6" class="f"/><circle cx="18" cy="6" r=".6" class="f"/><circle cx="12" cy="3.5" r=".6" class="f"/>' },
  { id: 'chakra', label: 'Chakra', hint: 'Ground spinner',
    icon: '<circle cx="12" cy="12" r="6"/><path d="M12 12c0-1.4 1.8-1.4 1.8 0s-1.4 2.8-3.2 2.2-2-3.6.4-4.6 5 .8 4.6 3.6"/><path d="M18 9.5l3.4-1.6M8.6 17.6l-1.8 3.2M8.4 6.6 6.2 3.6"/>' },
  { id: 'phuljhadi', label: 'Phuljhadi', hint: 'Sparkler',
    icon: '<path d="M12 22V9"/><path d="M12 7v-3M12 7l-2.5-2.5M12 7l2.5-2.5M12 7H8.5M12 7h3.5M12 7l-2.5 2.5M12 7l2.5 2.5"/><path d="M9.5 22h5"/>' },
  { id: 'ladi', label: 'Ladi', hint: 'String of crackers',
    icon: '<path d="M2 14c3-2 5 2 8 0s5-2 8 0 3 1 4 0"/><rect x="4" y="9" width="2" height="5" rx=".6"/><rect x="9" y="11" width="2" height="5" rx=".6"/><rect x="14" y="9" width="2" height="5" rx=".6"/><rect x="19" y="10" width="2" height="5" rx=".6"/>' },
  { id: 'bijli', label: 'Bijli bomb', hint: 'Big bang',
    icon: '<rect x="8" y="9" width="8" height="12" rx="1.4"/><path d="M12 9c0-2 2-3 3-5"/><path d="M13 12l-2.4 3.4H13L11 19"/>' },
  { id: 'candle', label: 'Roman candle', hint: 'Fires coloured balls',
    icon: '<rect x="10" y="12" width="4" height="10" rx="1"/><circle cx="12" cy="8" r="1.4"/><circle cx="12" cy="4" r="1.1"/><path d="M10 15h4M10 18.5h4"/>' },
  { id: 'sutli', label: 'Sutli bomb', hint: 'The loudest one',
    icon: '<circle cx="12" cy="15" r="6"/><path d="M7 12.5c3 1.5 7 1.5 10 0M6.5 16c3.5 1.6 7.5 1.6 11 0"/><path d="M12 9c.4-2.4 2-3.4 3.6-4.6"/><circle cx="16.2" cy="4" r=".7" class="f"/>' },
];

export const SKY = [
  { id: 'peony', label: 'Peony', hint: 'Classic round burst',
    icon: '<circle cx="12" cy="12" r="1.3" class="f"/><path d="M12 6.5v-3M12 17.5v3M6.5 12h-3M17.5 12h3M8.1 8.1 6 6M15.9 15.9 18 18M8.1 15.9 6 18M15.9 8.1 18 6"/>' },
  { id: 'chrysanthemum', label: 'Chrysanthemum', hint: 'Burst with trails',
    icon: '<circle cx="12" cy="12" r="1.2" class="f"/><path d="M12 9V2.5M12 15v6.5M9 12H2.5M15 12h6.5M9.9 9.9 5 5M14.1 14.1 19 19M9.9 14.1 5 19M14.1 9.9 19 5" stroke-dasharray="1.6 1.4"/>' },
  { id: 'willow', label: 'Willow', hint: 'Golden drooping strands',
    icon: '<circle cx="12" cy="6" r="1.2" class="f"/><path d="M12 6c-4 0-7 4-7.5 12M12 6c4 0 7 4 7.5 12M12 6c-2 1-3.5 6-3.5 14M12 6c2 1 3.5 6 3.5 14M12 6v15"/>' },
  { id: 'palm', label: 'Palm', hint: 'Thick golden arms',
    icon: '<path d="M12 21V9"/><path d="M12 9C9 6 5 6 3 9M12 9c3-3 7-3 9 0M12 9C10 5 8 3.5 6 3M12 9c2-4 4-5.5 6-6"/>' },
  { id: 'crossette', label: 'Crossette', hint: 'Stars split in four',
    icon: '<path d="M12 12 6 6M12 12l6-6M12 12l-6 6M12 12l6 6"/><path d="M6 6H3.5M6 6V3.5M18 6h2.5M18 6V3.5M6 18H3.5M6 18v2.5M18 18h2.5M18 18v2.5"/>' },
  { id: 'ring', label: 'Ring', hint: 'Saturn ring',
    icon: '<circle cx="12" cy="12" r="4.2"/><ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-24 12 12)" stroke-dasharray="1.6 1.5"/>' },
  { id: 'heart', label: 'Heart', hint: 'A heart in the sky',
    icon: '<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z" stroke-dasharray="1.8 1.5"/>' },
  { id: 'spiral', label: 'Spiral', hint: 'Spinning arms',
    icon: '<path d="M12 12c0-1.5 2-1.5 2 0s-1.6 3-3.6 2.4S8 11 10 9.2s6.2-1.2 7 2.4-2.2 7.4-6.4 6.8S4.6 12.6 6.6 8"/>' },
  { id: 'crackle', label: 'Crackle', hint: 'Glitter that pops',
    icon: '<path d="M5 6l1.4 1.4M18 5l-1 1.6M4 15l1.8-.4M19 16l-1.6-.6M10 20l.6-1.6M15 3.5l-.4 1.8"/><path d="M12 9.5 13 12l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>' },
  { id: 'zigzag', label: 'Zig-zag', hint: 'A wild rocket',
    icon: '<path d="M7 22l3-4-3-3 4-3-3-3 4-4"/><path d="M12 5l1.5-2.5L15 5"/><circle cx="17" cy="9" r=".7" class="f"/><circle cx="19" cy="5" r=".7" class="f"/>' },
  { id: 'strobe', label: 'Strobe', hint: 'Blinking white stars',
    icon: '<circle cx="7" cy="8" r="1.6" class="f"/><circle cx="16" cy="6" r="1"/><circle cx="17" cy="15" r="1.6" class="f"/><circle cx="8" cy="17" r="1"/><path d="M7 4.5v-1M7 12.5v-1M3.5 8h-1M11.5 8h-1M17 11.5v-1M17 19.5v-1M13.5 15h-1M21.5 15h-1"/>' },
  { id: 'multibreak', label: 'Multi-break', hint: 'Bursts, then bursts again',
    icon: '<circle cx="12" cy="13" r="1" class="f"/><path d="M12 13 6 7M12 13l6-6M12 13v7"/><path d="M6 7l-2-1M6 7V4.6M6 7H3.6M18 7l2-1M18 7V4.6M18 7h2.4M12 20l-2 1.4M12 20l2 1.4M12 20v2"/>' },
  { id: 'lantern', label: 'Sky lantern', hint: 'Floats away on the breeze',
    icon: '<path d="M8 4h8c1.4 3 1.4 9 0 12H8C6.6 13 6.6 7 8 4z"/><path d="M9 16h6M12 4v12"/><path d="M12 18.5c.8.6.8 1.6 0 2.4-.8-.8-.8-1.8 0-2.4z" class="f"/>' },
];

