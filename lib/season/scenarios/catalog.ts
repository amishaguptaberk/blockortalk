import type { PublicScenario } from './types';

// Public facts only. Server outlines must never be imported here.
export const scenarioCatalog: readonly PublicScenario[] = [
  {
    "id": "bank",
    "category": "Bank fraud alert",
    "org": "Puffinvale Bank",
    "card": {
      "name": "Player Fern",
      "facts": [
        "A practice purchase of 18 tokens is pending."
      ],
      "ownApp": {
        "title": "Puffinvale Bank \u00b7 your own app",
        "facts": [
          "A practice purchase of 18 tokens is pending.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8201"
      }
    ]
  },
  {
    "id": "delivery",
    "category": "Delivery or customs fee",
    "org": "Mossparcel",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Parcel MOSS-7 is at the fictional depot."
      ],
      "ownApp": {
        "title": "Mossparcel \u00b7 your own app",
        "facts": [
          "Parcel MOSS-7 is at the fictional depot.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8202"
      }
    ]
  },
  {
    "id": "holiday",
    "category": "Holiday gift card or travel deal",
    "org": "Wispwing Holidays",
    "card": {
      "name": "Player Fern",
      "facts": [
        "A winter cabin offer is saved."
      ],
      "ownApp": {
        "title": "Wispwing Holidays \u00b7 your own app",
        "facts": [
          "A winter cabin offer is saved.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8203"
      }
    ]
  },
  {
    "id": "business",
    "category": "Business invoice or CEO wire",
    "org": "Fernwhistle Works",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Invoice FERN-8 is awaiting review."
      ],
      "ownApp": {
        "title": "Fernwhistle Works \u00b7 your own app",
        "facts": [
          "Invoice FERN-8 is awaiting review.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8204"
      }
    ]
  },
  {
    "id": "phishing",
    "category": "Phishing link texted mid-call",
    "org": "Cloudpetal Club",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Your fictional club renewal is due."
      ],
      "ownApp": {
        "title": "Cloudpetal Club \u00b7 your own app",
        "facts": [
          "Your fictional club renewal is due.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8205"
      }
    ]
  },
  {
    "id": "support",
    "category": "Tech support",
    "org": "Pebbleglow Devices",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Device PEBBLE-2 has a support appointment."
      ],
      "ownApp": {
        "title": "Pebbleglow Devices \u00b7 your own app",
        "facts": [
          "Device PEBBLE-2 has a support appointment.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8206"
      }
    ]
  },
  {
    "id": "government",
    "category": "Government (IRS or SSN)",
    "org": "Moonmoth Civic Office",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Practice notice MOON-3 is available."
      ],
      "ownApp": {
        "title": "Moonmoth Civic Office \u00b7 your own app",
        "facts": [
          "Practice notice MOON-3 is available.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8207"
      }
    ]
  },
  {
    "id": "prize",
    "category": "Prize or sweepstakes",
    "org": "Dandelark Draw",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Entry DANDY-4 is recorded."
      ],
      "ownApp": {
        "title": "Dandelark Draw \u00b7 your own app",
        "facts": [
          "Entry DANDY-4 is recorded.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8208"
      }
    ]
  },
  {
    "id": "investment",
    "category": "Crypto or investment",
    "org": "Acornorbit Exchange",
    "card": {
      "name": "Player Fern",
      "facts": [
        "A practice investment summary is available."
      ],
      "ownApp": {
        "title": "Acornorbit Exchange \u00b7 your own app",
        "facts": [
          "A practice investment summary is available.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8209"
      }
    ]
  },
  {
    "id": "carrier",
    "category": "Phone carrier port-out",
    "org": "Bramblebell Mobile",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Line BRAMBLE-5 has a transfer notice."
      ],
      "ownApp": {
        "title": "Bramblebell Mobile \u00b7 your own app",
        "facts": [
          "Line BRAMBLE-5 has a transfer notice.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8210"
      }
    ]
  },
  {
    "id": "refund",
    "category": "Refund or billing error",
    "org": "Mothledger",
    "card": {
      "name": "Player Fern",
      "facts": [
        "A practice refund of 18 tokens is pending."
      ],
      "ownApp": {
        "title": "Mothledger \u00b7 your own app",
        "facts": [
          "A practice refund of 18 tokens is pending.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8211"
      }
    ]
  },
  {
    "id": "insurance",
    "category": "Insurance policy check",
    "org": "Pebblewick Mutual",
    "card": {
      "name": "Player Fern",
      "facts": [
        "Practice policy WICK-6 is on file."
      ],
      "ownApp": {
        "title": "Pebblewick Mutual \u00b7 your own app",
        "facts": [
          "Practice policy WICK-6 is on file.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8212"
      }
    ]
  },
  {
    "id": "sales",
    "category": "Subscription or sales call",
    "org": "Cinderpost",
    "card": {
      "name": "Player Fern",
      "facts": [
        "A practice subscription offer is saved."
      ],
      "ownApp": {
        "title": "Cinderpost \u00b7 your own app",
        "facts": [
          "A practice subscription offer is saved.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8213"
      }
    ]
  },
  {
    "id": "wrong-number",
    "category": "Wrong number",
    "org": "Lanternloop",
    "card": {
      "name": "Player Fern",
      "facts": [
        "This practice line is not expecting a call."
      ],
      "ownApp": {
        "title": "Lanternloop \u00b7 your own app",
        "facts": [
          "This practice line is not expecting a call.",
          "Use the saved contact in this app to check a notice."
        ]
      }
    },
    "secrets": [
      {
        "label": "Practice protection code",
        "value": "8214"
      }
    ]
  }
];
