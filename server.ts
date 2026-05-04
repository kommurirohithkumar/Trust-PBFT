import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Station, HealthRecord, LedgerEntry, ConsensusRound, FaultRecord } from "./src/types.ts";

async function startServer() {
  console.log("Starting TrustLink server...");
  console.log("Checking GEMINI_API_KEY status:", process.env.GEMINI_API_KEY ? "PRESENT (Masked)" : "MISSING");
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory state for simulation
  let stations: Station[] = [
    { id: "S1", name: "Central Hospital", trustScore: 0.95, isMalicious: false, isPrimary: true, lastActive: new Date().toISOString(), history: [{ timestamp: new Date().toISOString(), score: 0.95, action: "INITIAL" }] },
    { id: "S2", name: "West Side Clinic", trustScore: 0.85, isMalicious: false, isPrimary: false, lastActive: new Date().toISOString(), history: [{ timestamp: new Date().toISOString(), score: 0.85, action: "INITIAL" }] },
    { id: "S3", name: "City Diagnostic Lab", trustScore: 0.88, isMalicious: false, isPrimary: false, lastActive: new Date().toISOString(), history: [{ timestamp: new Date().toISOString(), score: 0.88, action: "INITIAL" }] },
    { id: "S4", name: "North Health Center (Suspicious)", trustScore: 0.45, isMalicious: true, isPrimary: false, lastActive: new Date().toISOString(), history: [{ timestamp: new Date().toISOString(), score: 0.45, action: "MALICIOUS" }] },
    { id: "S5", name: "Elite Medical Hub", trustScore: 0.92, isMalicious: false, isPrimary: false, lastActive: new Date().toISOString(), history: [{ timestamp: new Date().toISOString(), score: 0.92, action: "INITIAL" }] },
  ];

  let ledger: LedgerEntry[] = [];
  let activeRounds: ConsensusRound[] = [];
  let faultLogs: FaultRecord[] = [];
  let sequenceCounter = 0;

  const recordFault = (stationId: string, type: FaultRecord['type'], details: string, severity: FaultRecord['severity']) => {
    const fault: FaultRecord = {
      timestamp: new Date().toISOString(),
      stationId,
      type,
      details,
      severity,
      blocked: true
    };
    faultLogs.push(fault);
    if (faultLogs.length > 50) faultLogs.shift();
  };

  // Detailed Trust Evaluation Factors
  const TRUST_PARAMS = {
    REWARD: 0.02,     // Reward for honest contribution
    MALICIOUS_PENALTY: 0.15, // Severe penalty for malicious acts
    INACTIVE_PENALTY: 0.05,  // Penalty for missing a round
    DECAY_RATE: 0.995 // Natural trust decay over time (simulated)
  };

  const updateStationTrust = (station: Station, behavior: 'HONEST' | 'MALICIOUS' | 'INACTIVE') => {
    let oldScore = station.trustScore;
    let newScore = oldScore;

    switch (behavior) {
      case 'HONEST':
        // Growth is slower as you reach 1.0 (Diminishing returns)
        newScore = Math.min(1.0, oldScore + (TRUST_PARAMS.REWARD * (1 - oldScore)));
        break;
      case 'MALICIOUS':
        newScore = Math.max(0.1, oldScore - TRUST_PARAMS.MALICIOUS_PENALTY);
        break;
      case 'INACTIVE':
        newScore = Math.max(0.1, oldScore - TRUST_PARAMS.INACTIVE_PENALTY);
        break;
    }

    station.trustScore = Number(newScore.toFixed(4));
    station.history.push({
      timestamp: new Date().toISOString(),
      score: station.trustScore,
      action: behavior
    });
    
    // Keep history manageable
    if (station.history.length > 20) station.history.shift();
  };

  // Helper: Calculate Consensus Threshold (e.g., 2/3 of total trust)
  const calculateTrustThreshold = () => {
    const totalTrust = stations.reduce((acc, s) => acc + s.trustScore, 0);
    return (totalTrust * 0.67); // Standard BFT 2/3 threshold weighted by trust
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/api/stations", (req, res) => {
    res.json(stations);
  });

  app.post("/api/stations/:id/toggle-malicious", (req, res) => {
    const station = stations.find(s => s.id === req.params.id);
    if (station) {
      station.isMalicious = !station.isMalicious;
      res.json(station);
    } else {
      res.status(404).json({ error: "Station not found" });
    }
  });

  app.get("/api/ledger", (req, res) => {
    res.json(ledger);
  });

  app.get("/api/rounds", (req, res) => {
    res.json(activeRounds);
  });

  app.get("/api/faults", (req, res) => {
    res.json(faultLogs);
  });

  // Submit a new record for consensus
  app.post("/api/propose", (req, res) => {
    const record: HealthRecord = req.body;
    const primary = stations.find(s => s.isPrimary);

    if (!primary) return res.status(500).json({ error: "No primary station active" });

    const roundId = `round-${Date.now()}`;
    const round: ConsensusRound = {
      id: roundId,
      sequence: ++sequenceCounter,
      startTime: new Date().toISOString(),
      status: 'PENDING',
      record,
      proposer: primary.id,
      votes: {},
      trustThreshold: calculateTrustThreshold(),
      accumulatedTrust: 0
    };

    activeRounds.push(round);

    // Simulate PBFT Process
    runConsensus(roundId);

    res.json({ roundId, status: "Simulation started" });
  });

  // Automated background prompter to ensure the model is "working" without manual clicks
  const PATIENTS = ["John Doe", "Jane Smith", "Robert Brown", "Emily Davis", "Michael Wilson"];
  const LOCATIONS = ["Ward A", "ICU", "Emergency", "Outpatient", "Cardiology"];

  setInterval(() => {
    if (activeRounds.length === 0 && ledger.length < 50) {
      const primary = stations.find(s => s.isPrimary);
      if (!primary) return;

      const roundId = `auto-round-${Date.now()}`;
      const round: ConsensusRound = {
        id: roundId,
        sequence: ++sequenceCounter,
        startTime: new Date().toISOString(),
        status: 'PENDING',
        record: {
          patientName: PATIENTS[Math.floor(Math.random() * PATIENTS.length)],
          heartRate: 60 + Math.floor(Math.random() * 40),
          bloodPressure: `${110 + Math.floor(Math.random() * 30)}/${70 + Math.floor(Math.random() * 20)}`,
          glucose: Math.floor(80 + Math.random() * 40),
          timestamp: new Date().toISOString(),
          sensorMetadata: {
            deviceId: `AUTO-${Math.floor(Math.random() * 1000)}`,
            location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]
          },
          id: Math.random().toString(36).substring(7)
        },
        proposer: primary.id,
        votes: {},
        trustThreshold: calculateTrustThreshold(),
        accumulatedTrust: 0
      };
      
      activeRounds.push(round);
      console.log(`[Auto-Consensus] Starting round ${roundId}`);
      runConsensus(roundId);
    }
  }, 5000);

  async function runConsensus(roundId: string) {
    const round = activeRounds.find(r => r.id === roundId);
    if (!round) return;

    // 1. PRE-PREPARE (Already done by submission)
    round.status = 'PREPARING';
    
    // Simulate network delay (Reduced for faster demo)
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. PREPARE Phase
    stations.forEach(s => {
      if (!s.isMalicious) {
        round.votes[s.id] = { prepare: true, commit: false };
      } else {
        // Malicious node attempts data poisoning or Byzantine voting
        const attackType = Math.random();
        if (attackType > 0.6) {
          // Attack 1: Data Tampering (simulated)
          recordFault(s.id, 'DATA_TAMPERING', `Node tried to modify HeartRate of ${round.record.patientName}`, 'HIGH');
          round.votes[s.id] = { prepare: false, commit: false };
        } else if (attackType > 0.3) {
          // Attack 2: Byzantine Vote (Voting NO on valid data)
          recordFault(s.id, 'BYZANTINE_VOTE', 'Node cast negative vote despite valid data hash', 'MEDIUM');
          round.votes[s.id] = { prepare: false, commit: false };
        } else {
          // Attack 3: Inactivity
          recordFault(s.id, 'INACTIVITY', 'Node unresponsive during Prepare phase', 'LOW');
        }
      }
    });

    // Calculate sum of trust from prepared nodes
    const prepareTrust = stations
      .filter(s => round.votes[s.id]?.prepare)
      .reduce((acc, s) => acc + s.trustScore, 0);

    if (prepareTrust >= round.trustThreshold) {
      round.status = 'COMMITTING';
      round.accumulatedTrust = prepareTrust;
      
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. COMMIT Phase
      stations.forEach(s => {
        if (!s.isMalicious && round.votes[s.id]?.prepare) {
          round.votes[s.id].commit = true;
        }
      });

      const commitTrust = stations
        .filter(s => round.votes[s.id]?.commit)
        .reduce((acc, s) => acc + s.trustScore, 0);

      if (commitTrust >= round.trustThreshold) {
        round.status = 'COMMITTED';
        
        // Add to ledger
        const entry: LedgerEntry = {
          blockIndex: ledger.length + 1,
          timestamp: new Date().toISOString(),
          data: round.record,
          consensusHash: Math.random().toString(36).substring(7),
          validatedBy: stations.filter(s => round.votes[s.id]?.commit).map(s => s.id)
        };
        ledger.push(entry);

        // Update Trust Scores (Paper logic: Rewards and Penalties)
        stations.forEach(s => {
          if (round.votes[s.id]?.commit) {
            updateStationTrust(s, 'HONEST');
          } else if (s.isMalicious) {
            updateStationTrust(s, 'MALICIOUS');
          } else {
            updateStationTrust(s, 'INACTIVE');
          }
        });
      } else {
        round.status = 'FAILED';
        // Minor penalty for failed round stakeholders
        stations.forEach(s => {
          if (s.isMalicious) updateStationTrust(s, 'MALICIOUS');
        });
      }
    } else {
      round.status = 'FAILED';
    }

    // Cleanup old rounds after some time
    setTimeout(() => {
      activeRounds = activeRounds.filter(r => r.id !== roundId);
    }, 10000);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
