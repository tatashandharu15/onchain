// Generated from contracts/src/Endorsements.sol (subset used by the app). Regenerate after changing the contract.
export const endorsementsAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "endorser",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "AlreadyEndorsed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "currentNonce",
        "type": "uint256"
      }
    ],
    "name": "InvalidAccountNonce",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSignature",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "endorser",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "NotEndorsed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "SignatureExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "UnknownSkill",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "endorser",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "viaSignature",
        "type": "bool"
      }
    ],
    "name": "Endorsed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "endorser",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "Unendorsed",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "endorse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "endorser",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "endorseBySig",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "endorsementCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "viewer",
        "type": "address"
      }
    ],
    "name": "getSkills",
    "outputs": [
      {
        "internalType": "string[]",
        "name": "names",
        "type": "string[]"
      },
      {
        "internalType": "uint256[]",
        "name": "counts",
        "type": "uint256[]"
      },
      {
        "internalType": "bool[]",
        "name": "endorsedByViewer",
        "type": "bool[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "endorser",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "hasEndorsed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "nonces",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "skillCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "skillId",
        "type": "uint256"
      }
    ],
    "name": "unendorse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
