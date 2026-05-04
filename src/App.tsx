import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { CivicriseAudio } from "./game/audio";
import { DEFAULT_SCENARIO_ID, POLICY_DEFINITIONS, SCENARIOS, TOOL_DEFINITIONS, getScenario } from "./game/scenario";
import {
  advanceGameState,
  applyTool,
  createReviewGameState,
  getIncidentForecast,
  dismissBanner,
  evaluatePlacement,
  formatMoney,
  getCurrentMilestone,
  getTile,
  getTutorialStatus,
  setGamePaused,
  setGameSpeed,
  snapshotGameState,
  togglePolicy,
  createGameState,
} from "./game/simulation";
import { pickTileFromCanvas, renderDistrict } from "./game/renderer";
import { clearSavedGame, loadOptions, loadSavedGame, saveGame, saveOptions } from "./game/storage";
import { GameState, GridPoint, MilestoneDefinition, SavePayload, ToolId, UserOptions } from "./game/types";

const KEY_TOOL_MAP: Record<string, ToolId> = {
  "1": "road",
  "2": "residential",
  "3": "commercial",
  "4": "industrial",
  "5": "park",
  "6": "utility",
  "7": "transit",
  x: "bulldoze",
};

interface BootConfig {
  autostart: boolean;
  review: boolean;
  scenarioId: string;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatRisk(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDay(day: number): string {
  return `Day ${day}`;
}

function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getUnlockCopy(scenarioId: string, unlockStage: number): string {
  if (unlockStage <= 0) {
    return "Available now";
  }

  const scenario = getScenario(scenarioId);
  const milestone = scenario.milestones[Math.max(0, unlockStage - 1)];
  return milestone ? `After ${milestone.stageName}` : "Unlock later";
}

function getMilestoneChecklist(state: GameState, milestone: MilestoneDefinition | null) {
  if (!milestone) {
    return [];
  }

  return [
    {
      label: "Residents",
      current: `${state.metrics.population}`,
      target: `${milestone.targetPopulation}`,
      met: state.metrics.population >= milestone.targetPopulation,
    },
    {
      label: "Happiness",
      current: `${state.metrics.happiness}%`,
      target: `${milestone.minHappiness}%`,
      met: state.metrics.happiness >= milestone.minHappiness,
    },
    {
      label: "Treasury",
      current: formatMoney(state.treasury),
      target: formatMoney(milestone.minTreasury),
      met: state.treasury >= milestone.minTreasury,
    },
    {
      label: "Services",
      current: `${state.metrics.serviceScore}%`,
      target: `${milestone.minServiceScore}%`,
      met: state.metrics.serviceScore >= milestone.minServiceScore,
    },
    {
      label: "Traffic",
      current: `${state.metrics.trafficScore}%`,
      target: `${milestone.minTrafficScore}%`,
      met: state.metrics.trafficScore >= milestone.minTrafficScore,
    },
  ];
}

function getPlannerNotes(state: GameState): string[] {
  const scenario = getScenario(state.scenarioId);

  if (state.phase === "won") {
    return [
      `${scenario.districtName} is review-ready. Use free runs to experiment with cleaner road patterns, stronger transit, and steadier service coverage.`,
    ];
  }

  const notes: string[] = [];
  const totalZonedLots =
    state.metrics.zoneCounts.residential +
    state.metrics.zoneCounts.commercial +
    state.metrics.zoneCounts.industrial;

  if (state.actions.playerRoads < 8) {
    notes.push("Extend roads off the fixed boulevard before filling the interior with zones.");
  }

  if (state.actions.residentialPlaced < 6) {
    notes.push("Start with a compact housing cluster on the upper-left branch so population can build quickly.");
  }

  if (state.actions.commercialPlaced < 3) {
    notes.push("Mix in a few commercial lots near housing to turn early footfall into local jobs.");
  }

  if (state.actions.industrialPlaced < 2) {
    notes.push("Keep industry farther east near the fixed boulevard so homes keep their appeal.");
  }

  if (state.stageIndex >= 1 && state.actions.transitPlaced < 1) {
    notes.push("Settlement has unlocked transit. Add a stop on the main road spine before congestion hardens.");
  }

  if (state.metrics.population >= 60 && state.actions.utilitiesPlaced < 1) {
    notes.push("Add a utility tile once the first homes are filling so service pressure does not spike.");
  }

  if (state.actions.residentialPlaced >= 4 && state.actions.parksPlaced < 1) {
    notes.push("Parks work best as a buffer between homes and heavier employment blocks.");
  }

  if (totalZonedLots > 0 && state.metrics.coverage.connectedLotRatio < 0.92) {
    notes.push("Some zoned lots are still disconnected. Every active block needs road access to grow.");
  }

  if (state.metrics.coverage.pollutionRatio > 0.22) {
    notes.push("Pollution is cutting into happiness. Shift future industry away from homes or add more park buffer.");
  }

  if (state.metrics.population >= 120 && state.metrics.coverage.utilityRatio < 0.42) {
    notes.push("Service coverage is getting thin for a district this size. Add another utility tile or cluster growth closer in.");
  }

  if (state.metrics.population >= 150 && state.metrics.coverage.parkRatio < 0.3) {
    notes.push("The next milestone likely needs another park close to housing to lift happiness.");
  }

  if (state.stageIndex >= 1 && Object.values(state.policies).every((active) => !active)) {
    notes.push("The next planning layer is open. Try a policy once the budget can absorb the extra daily upkeep.");
  }

  if (state.metrics.trafficScore < 65) {
    notes.push("Traffic is slipping. Spread growth across the road spine instead of stacking one branch too heavily.");
  }

  if (state.metrics.economy.net < 0) {
    notes.push("Pause expansion for a moment. Let jobs and rents refill the treasury before placing more upkeep-heavy tiles.");
  }

  if (state.metrics.budgetPressure > 0.55) {
    notes.push("Budget pressure is high. Ease upkeep-heavy expansion or grow jobs before adding new services.");
  }

  if (notes.length === 0) {
    notes.push("The district is stable. Keep tuning coverage and growth toward the next review gate.");
  }

  if (state.scenarioId === "rivergate" && state.actions.playerRoads < 14) {
    notes.unshift("Rivergate rewards two active growth corridors rather than one dense branch. Open both before zoning too deeply.");
  }

  return notes.slice(0, 3);
}

function getIncidentPanelCopy(state: GameState) {
  const forecast = getIncidentForecast(state);

  if (state.activeIncident) {
    return {
      heading: state.activeIncident.title,
      summary: state.activeIncident.summary,
      effect: state.activeIncident.effectSummary,
      mitigation: state.activeIncident.mitigation,
      active: true,
      activeDays: state.activeIncident.daysActive,
    };
  }

  if (state.metrics.incidentOutlook === "Calm") {
    return {
      heading: "District calm",
      summary: "No immediate disruption is building. The current plan is resilient enough to absorb routine urban strain.",
      effect: "No active incident is dragging on the district.",
      mitigation: "Keep utility, park, and transit coverage balanced as the city grows.",
      active: false,
      activeDays: 0,
    };
  }

  if (forecast) {
    return {
      heading: `${forecast.title} watch`,
      summary: forecast.summary,
      effect: forecast.effectSummary,
      mitigation: forecast.mitigation,
      active: false,
      activeDays: 0,
    };
  }

  return {
    heading: `${state.metrics.incidentOutlook} watch`,
    summary: "District conditions are tightening, but no single crisis has taken hold yet.",
    effect: "Pressure is building across the network and will harden if growth outruns coverage.",
    mitigation: "Ease congestion, expand services, and avoid overloading one corridor.",
    active: false,
    activeDays: 0,
  };
}

function getBootScenarioId(rawScenarioId: string | null, fallbackScenarioId: string): string {
  if (rawScenarioId && SCENARIOS.some((scenario) => scenario.id === rawScenarioId)) {
    return rawScenarioId;
  }

  return fallbackScenarioId;
}

function getBootConfig(): BootConfig {
  if (typeof window === "undefined") {
    return {
      autostart: false,
      review: false,
      scenarioId: DEFAULT_SCENARIO_ID,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const review = params.get("review") === "1";
  const autostart = review || params.get("autostart") === "1";
  const scenarioId = getBootScenarioId(params.get("scenario"), review ? "rivergate" : DEFAULT_SCENARIO_ID);

  return {
    autostart,
    review,
    scenarioId,
  };
}

const BOOT_CONFIG = getBootConfig();
const INITIAL_SAVE = BOOT_CONFIG.review ? null : loadSavedGame();
const INITIAL_VIEW_STATE: GameState | null = BOOT_CONFIG.review
  ? createReviewGameState(BOOT_CONFIG.scenarioId)
  : BOOT_CONFIG.autostart
    ? createGameState(BOOT_CONFIG.scenarioId)
    : INITIAL_SAVE?.state ?? null;
const INITIAL_SCREEN: "title" | "playing" = BOOT_CONFIG.autostart ? "playing" : "title";

function App() {
  const [screen, setScreen] = useState<"title" | "playing">(INITIAL_SCREEN);
  const [selectedTool, setSelectedTool] = useState<ToolId>("road");
  const [showOptions, setShowOptions] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showScenarioPicker, setShowScenarioPicker] = useState(false);
  const [hoveredTile, setHoveredTile] = useState<GridPoint | null>(null);
  const [savePayload, setSavePayload] = useState<SavePayload | null>(INITIAL_SAVE);
  const [options, setOptions] = useState<UserOptions>(() => loadOptions());
  const [viewState, setViewState] = useState<GameState | null>(INITIAL_VIEW_STATE);
  const deferredState = useDeferredValue(viewState);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<GameState | null>(INITIAL_VIEW_STATE);
  const hoveredRef = useRef<GridPoint | null>(null);
  const selectedToolRef = useRef<ToolId>(selectedTool);
  const optionsRef = useRef<UserOptions>(options);
  const audioRef = useRef<CivicriseAudio | null>(null);
  const lastBannerIdRef = useRef<number | null>(INITIAL_VIEW_STATE?.banner?.id ?? null);
  const pageVisibleRef = useRef(typeof document === "undefined" ? true : document.visibilityState !== "hidden");

  useEffect(() => {
    const audio = new CivicriseAudio();
    audio.setOptions(options);
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

  useEffect(() => {
    optionsRef.current = options;
    saveOptions(options);
    audioRef.current?.setOptions(options);
  }, [options]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      pageVisibleRef.current = document.visibilityState !== "hidden";
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const renderFrame = (timeMs = performance.now()) => {
    const state = gameRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) {
      return;
    }

    renderDistrict(canvas, state, {
      hoveredTile: hoveredRef.current,
      selectedTool: selectedToolRef.current,
      reducedMotion: optionsRef.current.reducedMotion,
      timeMs,
    });
  };

  useEffect(() => {
    if (screen !== "playing") {
      return;
    }

    let frame = 0;
    let timer = 0;
    let lastTime = performance.now();
    let lastRenderTime = 0;
    let snapshotTimer = 0;
    let saveTimer = 0;

    const scheduleNextFrame = (delayMs = 0) => {
      if (delayMs > 0) {
        timer = window.setTimeout(() => {
          frame = requestAnimationFrame(tick);
        }, delayMs);
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      const state = gameRef.current;
      if (!state) {
        scheduleNextFrame(140);
        return;
      }

      const deltaSeconds = Math.min(0.045, (now - lastTime) / 1000);
      lastTime = now;

      const hidden = !pageVisibleRef.current;
      const shouldSimulate = !state.paused && !hidden;
      const minimumRenderInterval = hidden ? 280 : state.paused ? 150 : 0;

      if (shouldSimulate) {
        advanceGameState(state, deltaSeconds);
        audioRef.current?.updateMix(state.cars.length, state.metrics.servicePressure);

        snapshotTimer += deltaSeconds;
        saveTimer += deltaSeconds;

        if (snapshotTimer >= 0.16) {
          const snapshot = snapshotGameState(state);
          startTransition(() => {
            setViewState(snapshot);
          });
          snapshotTimer = 0;
        }

        if (saveTimer >= 4.5) {
          if (!BOOT_CONFIG.review) {
            const payload = saveGame(snapshotGameState(state));
            if (payload) {
              setSavePayload(payload);
            }
          }
          saveTimer = 0;
        }
      } else {
        snapshotTimer = 0;
        saveTimer = 0;
      }

      if (minimumRenderInterval === 0 || now - lastRenderTime >= minimumRenderInterval) {
        renderFrame(now);
        lastRenderTime = now;
      }

      scheduleNextFrame(minimumRenderInterval);
    };

    scheduleNextFrame();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screen !== "playing") {
        return;
      }

      const state = gameRef.current;
      if (!state) {
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        setGamePaused(state, !state.paused);
        syncViewState();
        audioRef.current?.playCue("ui");
        return;
      }

      const mappedTool = KEY_TOOL_MAP[event.key.toLowerCase()];
      if (mappedTool) {
        const unlockStage = TOOL_DEFINITIONS[mappedTool].unlockStage ?? 0;
        if (state.stageIndex < unlockStage) {
          return;
        }
        setSelectedTool(mappedTool);
        audioRef.current?.playCue("ui");
        return;
      }

      if (event.key === ",") {
        setGameSpeed(state, 1);
        syncViewState();
        return;
      }
      if (event.key === ".") {
        setGameSpeed(state, 2);
        syncViewState();
        return;
      }
      if (event.key === "/") {
        setGameSpeed(state, 3);
        syncViewState();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen]);

  const syncViewState = () => {
    const state = gameRef.current;
    if (!state) {
      return;
    }

    const snapshot = snapshotGameState(state);
    startTransition(() => {
      setViewState(snapshot);
    });
    renderFrame();
    if (!BOOT_CONFIG.review) {
      const payload = saveGame(snapshot);
      if (payload) {
        setSavePayload(payload);
      }
    }
  };

  const activeState = deferredState ?? viewState;
  const activeScenario = getScenario(activeState?.scenarioId ?? DEFAULT_SCENARIO_ID);
  const currentMilestone = activeState ? getCurrentMilestone(activeState) : getScenario(DEFAULT_SCENARIO_ID).milestones[0];
  const tutorialStatus = activeState ? getTutorialStatus(activeState) : { completed: 0, activeIndex: 0, total: 0 };
  const activeTutorial = activeScenario.tutorial[tutorialStatus.activeIndex];
  const milestoneChecklist = activeState ? getMilestoneChecklist(activeState, currentMilestone) : [];
  const plannerNotes = activeState ? getPlannerNotes(activeState) : [];
  const activePolicyCount = activeState
    ? Object.values(activeState.policies).filter(Boolean).length
    : 0;
  const incidentPanel = activeState ? getIncidentPanelCopy(activeState) : null;

  useEffect(() => {
    if (screen !== "playing" || !activeState?.banner) {
      return;
    }

    const banner = activeState.banner;

    if (lastBannerIdRef.current === banner.id) {
      return;
    }

    lastBannerIdRef.current = banner.id;
    void audioRef.current?.prime().then(() => {
      if (!audioRef.current) {
        return;
      }

      if (banner.tone === "danger") {
        audioRef.current.playCue("failure");
      } else if (banner.tone === "warning") {
        audioRef.current.playCue("warning");
      } else if (banner.tone === "success") {
        audioRef.current.playCue("milestone");
      } else {
        audioRef.current.playCue("ui");
      }
    });
  }, [activeState?.banner, screen]);

  const launchScenario = async (scenarioId: string) => {
    const state = BOOT_CONFIG.review ? createReviewGameState(scenarioId) : createGameState(scenarioId);
    gameRef.current = state;
    setScreen("playing");
    setSelectedTool("road");
    setHoveredTile(null);
    hoveredRef.current = null;
    const snapshot = snapshotGameState(state);
    setViewState(snapshot);
    if (BOOT_CONFIG.review) {
      setSavePayload(null);
    } else {
      const payload = saveGame(snapshot);
      if (payload) {
        setSavePayload(payload);
      }
    }
    setShowScenarioPicker(false);
    setShowHelp(false);
    setShowOptions(false);
    await audioRef.current?.prime();
    audioRef.current?.setOptions(optionsRef.current);
    audioRef.current?.playCue("milestone");
  };

  const continueSave = async () => {
    if (!savePayload) {
      return;
    }
    gameRef.current = savePayload.state;
    setViewState(snapshotGameState(savePayload.state));
    setScreen("playing");
    await audioRef.current?.prime();
    audioRef.current?.setOptions(optionsRef.current);
    audioRef.current?.playCue("ui");
  };

  const returnToTitle = () => {
    setScreen("title");
    audioRef.current?.playCue("ui");
  };

  const restartScenario = async () => {
    if (!BOOT_CONFIG.review) {
      clearSavedGame();
      setSavePayload(null);
    }
    await launchScenario(activeScenario.id);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = gameRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) {
      return;
    }

    const picked = pickTileFromCanvas(canvas, event.clientX, event.clientY, state);
    hoveredRef.current = picked;
    setHoveredTile(picked);
    renderFrame();
  };

  const handleCanvasLeave = () => {
    hoveredRef.current = null;
    setHoveredTile(null);
    renderFrame();
  };

  const handleCanvasClick = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = gameRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) {
      return;
    }

    const picked = pickTileFromCanvas(canvas, event.clientX, event.clientY, state);
    if (!picked) {
      return;
    }

    await audioRef.current?.prime();
    const result = applyTool(state, picked.x, picked.y, selectedToolRef.current);
    audioRef.current?.playCue(
      result.tone === "success"
        ? selectedToolRef.current === "road" || selectedToolRef.current === "bulldoze"
          ? "ui"
          : "place"
        : "warning",
    );
    syncViewState();
  };

  const dismissActiveBanner = () => {
    if (!gameRef.current) {
      return;
    }
    dismissBanner(gameRef.current);
    syncViewState();
  };

  const hoveredPreview =
    activeState && hoveredTile
      ? evaluatePlacement(activeState, hoveredTile.x, hoveredTile.y, selectedTool)
      : null;
  const hoveredTileData = activeState && hoveredTile ? getTile(activeState, hoveredTile.x, hoveredTile.y) : null;

  return (
    <div className={`app-root${options.reducedMotion ? " reduce-motion" : ""}`}>
      {screen === "title" && (
        <section className="title-screen">
          <div className="title-copy">
            <p className="eyebrow">E-lusion Studios / Browser prototype</p>
            <img
              src="brand/civicrise-mark.svg"
              alt="Civicrise mark"
              className="title-mark"
            />
            <h1>Civicrise</h1>
            <p className="title-tagline">{getScenario(DEFAULT_SCENARIO_ID).tagline}</p>
            <p className="title-story">{getScenario(DEFAULT_SCENARIO_ID).storyBeat}</p>
            <div className="title-badges">
              <span>Phase 2 prototype</span>
              <span>React + TypeScript + Canvas</span>
              <span>{SCENARIOS.length} scenarios</span>
              <span>Transit, policies, and crises</span>
            </div>
          </div>

          <aside className="title-panel panel">
            <div className="title-panel-section">
              <p className="micro-label">Current objective</p>
              <h2>{getScenario(DEFAULT_SCENARIO_ID).introHeading}</h2>
              <p>{getScenario(DEFAULT_SCENARIO_ID).introBody}</p>
            </div>

            {savePayload && (
              <div className="save-preview">
                <div>
                  <p className="micro-label">Latest district save</p>
                  <strong>{savePayload.state.metrics.currentStageName}</strong>
                </div>
                <span>{formatSavedAt(savePayload.savedAt)}</span>
                <div className="save-metrics">
                  <span>{savePayload.state.metrics.population} residents</span>
                  <span>{formatMoney(savePayload.state.treasury)}</span>
                  <span>{formatDay(savePayload.state.day)}</span>
                </div>
              </div>
            )}

            <div className="title-actions">
              <button className="action-button strong" onClick={() => void continueSave()} disabled={!savePayload}>
                Continue
              </button>
              <button className="action-button" onClick={() => setShowScenarioPicker(true)}>
                New City
              </button>
              <button className="action-button" onClick={() => setShowScenarioPicker(true)}>
                Scenarios
              </button>
              <button className="action-button" onClick={() => setShowOptions(true)}>
                Options
              </button>
              <button className="action-button" onClick={() => setShowHelp(true)}>
                Help
              </button>
            </div>
          </aside>
        </section>
      )}

      {screen === "playing" && activeState && (
        <section className="game-screen">
          <header className="top-hud panel">
              <div className="hud-cluster">
                <span className="district-chip">{activeScenario.districtName}</span>
                <div>
                  <p className="micro-label">Treasury</p>
                  <strong>{formatMoney(activeState.treasury)}</strong>
                <span className={`delta ${activeState.metrics.economy.net >= 0 ? "positive" : "negative"}`}>
                  {activeState.metrics.economy.net >= 0 ? "+" : ""}
                  {formatMoney(activeState.metrics.economy.net)}/day
                </span>
              </div>
                <div>
                  <p className="micro-label">Population</p>
                  <strong>{activeState.metrics.population}</strong>
                  <span>{activeState.metrics.jobs} jobs</span>
                </div>
                <div>
                  <p className="micro-label">Review</p>
                  <strong>{activeState.metrics.currentStageName}</strong>
                  <span>{formatDay(activeState.day)}</span>
                </div>
                <div>
                  <p className="micro-label">Planning</p>
                  <strong>{activePolicyCount} active</strong>
                  <span>{formatPercent(activeState.metrics.coverage.transitRatio * 100)} transit</span>
                </div>
                <div>
                  <p className="micro-label">Resilience</p>
                  <strong>{activeState.activeIncident ? activeState.activeIncident.title : activeState.metrics.incidentOutlook}</strong>
                  <span>{formatRisk(activeState.metrics.incidentRisk)} risk</span>
                </div>
                <div>
                  <p className="micro-label">Pressure</p>
                  <strong>{formatPercent(activeState.metrics.servicePressure)}</strong>
                  <span>{formatPercent(activeState.metrics.trafficScore)} traffic</span>
                </div>
                <div>
                  <p className="micro-label">Budget</p>
                  <strong>{formatPercent(activeState.metrics.budgetPressure * 100)}</strong>
                  <span>{formatMoney(activeState.metrics.economy.upkeep)}/day upkeep</span>
                </div>
            </div>

            <div className="hud-controls">
              <button
                className="small-button"
                onClick={() => {
                  if (!gameRef.current) {
                    return;
                  }
                  setGamePaused(gameRef.current, !gameRef.current.paused);
                  syncViewState();
                }}
              >
                {activeState.paused ? "Resume" : "Pause"}
              </button>
              <div className="speed-group">
                {[1, 2, 3].map((speed) => (
                  <button
                    key={speed}
                    className={`speed-button${activeState.speed === speed ? " active" : ""}`}
                    onClick={() => {
                      if (!gameRef.current) {
                        return;
                      }
                      setGameSpeed(gameRef.current, speed as 1 | 2 | 3);
                      syncViewState();
                    }}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              <button className="small-button" onClick={() => setShowHelp(true)}>
                Help
              </button>
              <button className="small-button" onClick={() => setShowOptions(true)}>
                Options
              </button>
              <button className="small-button" onClick={returnToTitle}>
                Title
              </button>
            </div>
          </header>

          <div className="game-layout">
            <div className="left-rail">
                <section className="panel objective-panel">
                  <p className="micro-label">Guided district tutorial</p>
                  <h2>{activeTutorial?.title}</h2>
                  <p>{activeTutorial?.description}</p>
                  <div className="tutorial-progress">
                  <span>
                    Step {Math.min(tutorialStatus.activeIndex + 1, tutorialStatus.total)} / {tutorialStatus.total}
                  </span>
                    <span>{tutorialStatus.completed} complete</span>
                  </div>
                  <div className="planner-notes">
                    <p className="micro-label">Planner notes</p>
                    <ul className="planner-list">
                      {plannerNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </section>

              {incidentPanel && (
                <section
                  className={`panel incident-panel${
                    activeState.activeIncident ? ` incident-${activeState.activeIncident.tone}` : ""
                  }`}
                >
                  <div className="incident-header">
                    <div>
                      <p className="micro-label">District resilience</p>
                      <h3>{incidentPanel.heading}</h3>
                    </div>
                    <span className={`incident-badge outlook-${activeState.metrics.incidentOutlook.toLowerCase()}`}>
                      {formatRisk(activeState.metrics.incidentRisk)}
                    </span>
                  </div>
                  <p>{incidentPanel.summary}</p>
                  <div className="incident-grid">
                    <div>
                      <span>Current effect</span>
                      <strong>{incidentPanel.effect}</strong>
                    </div>
                    <div>
                      <span>Mitigation</span>
                      <strong>{incidentPanel.mitigation}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>
                        {incidentPanel.active
                          ? `Active for ${incidentPanel.activeDays.toFixed(1)} days`
                          : `${activeState.metrics.incidentOutlook} outlook`}
                      </strong>
                    </div>
                  </div>
                </section>
              )}

              {activeState.banner && (
                <section className={`panel banner banner-${activeState.banner.tone}`}>
                  <div>
                    <p className="micro-label">District update</p>
                    <h3>{activeState.banner.title}</h3>
                    <p>{activeState.banner.body}</p>
                  </div>
                  {activeState.banner.persistent && (
                    <button className="ghost-button" onClick={dismissActiveBanner}>
                      Dismiss
                    </button>
                  )}
                </section>
              )}

              <section className="panel tooltip-panel">
                <p className="micro-label">Tile inspector</p>
                {hoveredTile && hoveredTileData ? (
                  <>
                    <h3>
                      {hoveredTile.x}, {hoveredTile.y}
                    </h3>
                    <p>
                      {hoveredTileData.terrain}
                      {hoveredTileData.road ? " / road" : ""}
                      {hoveredTileData.zone ? ` / ${hoveredTileData.zone}` : ""}
                      {hoveredTileData.structure ? ` / ${hoveredTileData.structure}` : ""}
                    </p>
                    <p>{hoveredPreview?.reason}</p>
                  </>
                ) : (
                  <p>Move across the district to inspect lots and road access.</p>
                )}
              </section>
            </div>

            <div className="viewport-card panel">
              <canvas
                ref={canvasRef}
                className="district-canvas"
                onPointerMove={handleCanvasPointerMove}
                onPointerLeave={handleCanvasLeave}
                onPointerDown={(event) => void handleCanvasClick(event)}
              />
            </div>

            <aside className="right-rail">
              <section className="panel stage-panel">
                <p className="micro-label">Milestone track</p>
                <h2>{currentMilestone ? currentMilestone.stageName : "Review complete"}</h2>
                <p>{currentMilestone?.description ?? `${activeScenario.districtName} is ready for review.`}</p>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.round((activeState.metrics.milestoneProgress || 0) * 100)}%`,
                    }}
                  />
                </div>
                {currentMilestone && (
                  <div className="milestone-checklist">
                    {milestoneChecklist.map((item) => (
                      <div key={item.label} className={`milestone-row${item.met ? " met" : ""}`}>
                        <span>{item.label}</span>
                        <strong>
                          {item.current} / {item.target}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel policy-panel">
                <p className="micro-label">Planning layer</p>
                <h2>Policies</h2>
                <p>
                  Toggle district-wide planning rules once milestones unlock them. Active policies add daily upkeep but
                  can steady a larger city.
                </p>
                <div className="policy-list">
                  {Object.values(POLICY_DEFINITIONS).map((policy) => {
                    const unlocked = activeState.stageIndex >= policy.unlockStage;
                    const active = activeState.policies[policy.id];
                    return (
                      <button
                        key={policy.id}
                        className={`policy-button${active ? " active" : ""}${unlocked ? "" : " locked"}`}
                        disabled={!unlocked}
                        onClick={() => {
                          if (!gameRef.current) {
                            return;
                          }
                          togglePolicy(gameRef.current, policy.id);
                          audioRef.current?.playCue(active ? "ui" : "milestone");
                          syncViewState();
                        }}
                        style={{ ["--accent" as string]: policy.accent }}
                      >
                        <div className="policy-heading">
                          <strong>{policy.label}</strong>
                          <span>{unlocked ? `${formatMoney(policy.upkeep)}/day` : getUnlockCopy(activeScenario.id, policy.unlockStage)}</span>
                        </div>
                        <p>{policy.description}</p>
                        <em>{unlocked ? (active ? "Active" : "Available") : "Locked"}</em>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="panel analytics-panel">
                <p className="micro-label">Demand and coverage</p>
                <MetricBar label="Residential demand" value={activeState.metrics.demand.residential} accent="mint" />
                <MetricBar label="Commercial demand" value={activeState.metrics.demand.commercial} accent="cyan" />
                <MetricBar label="Industrial demand" value={activeState.metrics.demand.industrial} accent="gold" />
                <MetricBar label="District risk" value={activeState.metrics.incidentRisk * 100} accent="warm" />
                <MetricBar label="Budget pressure" value={activeState.metrics.budgetPressure * 100} accent="gold" />
                <MetricBar label="Congestion" value={activeState.metrics.coverage.congestionRatio * 100} accent="warm" />
                <MetricBar
                  label="Transit coverage"
                  value={activeState.metrics.coverage.transitRatio * 100}
                  accent="cyan"
                />
                <MetricBar
                  label="Utility coverage"
                  value={activeState.metrics.coverage.utilityRatio * 100}
                  accent="warm"
                />
                <MetricBar
                  label="Park coverage"
                  value={activeState.metrics.coverage.parkRatio * 100}
                  accent="mint"
                />
                <MetricBar
                  label="Employment balance"
                  value={Math.min(activeState.metrics.coverage.employmentRatio, 1) * 100}
                  accent="cyan"
                />
              </section>

              <section className="panel log-panel">
                <p className="micro-label">City log</p>
                <div className="log-entries">
                  {activeState.log.map((entry) => (
                    <article key={entry.id} className={`log-entry tone-${entry.tone}`}>
                      <header>
                        <strong>{entry.title}</strong>
                        <span>{formatDay(entry.day)}</span>
                      </header>
                      <p>{entry.body}</p>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
          </div>

          <footer className="tool-rail panel">
            {Object.values(TOOL_DEFINITIONS).map((tool, index) => {
              const unlocked = activeState.stageIndex >= (tool.unlockStage ?? 0);
              const keyLabel = tool.id === "bulldoze" ? "X" : `${index + 1}`;
              return (
                <button
                  key={tool.id}
                  className={`tool-button${selectedTool === tool.id ? " active" : ""}${unlocked ? "" : " locked"}`}
                  onClick={() => {
                    if (unlocked) {
                    setSelectedTool(tool.id);
                  }
                }}
                disabled={!unlocked}
                style={{ ["--accent" as string]: tool.accent }}
                >
                  <span className="tool-key">{keyLabel}</span>
                  <strong>{tool.label}</strong>
                  <span>{unlocked ? formatMoney(tool.cost) : getUnlockCopy(activeScenario.id, tool.unlockStage ?? 0)}</span>
                </button>
              );
            })}
          </footer>

          {activeState.phase !== "running" && (
            <div className="overlay-backdrop">
              <section className="panel outcome-panel">
                <p className="micro-label">{activeState.phase === "won" ? "Review ready" : "District failed"}</p>
                <h2>
                  {activeState.phase === "won"
                    ? `${activeScenario.districtName} reached its final review milestone`
                    : `${activeScenario.districtName} fell short of review`}
                </h2>
                <p>
                  {activeState.phase === "won"
                    ? "This run proved the current district can carry zoning, transport, policy, budget pressure, and service pressure all the way through its scenario arc."
                    : "Take another pass with steadier services, cleaner transport, and a healthier treasury before the next review."}
                </p>
                <div className="overlay-actions">
                  <button className="action-button strong" onClick={() => void restartScenario()}>
                    New run
                  </button>
                  <button className="action-button" onClick={returnToTitle}>
                    Back to title
                  </button>
                </div>
              </section>
            </div>
          )}
        </section>
      )}

      {showScenarioPicker && (
        <Modal title="Scenarios" onClose={() => setShowScenarioPicker(false)}>
          <div className="scenario-grid">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                className="scenario-card"
                onClick={() => void launchScenario(scenario.id)}
              >
                <p className="micro-label">Available now</p>
                <h3>{scenario.name}</h3>
                <p>{scenario.tagline}</p>
                <span>{scenario.prompt}</span>
              </button>
            ))}
            <article className="scenario-card locked">
              <p className="micro-label">Phase 3</p>
              <h3>Campaign chapters</h3>
              <p>Long-form civic narratives, chained district reviews, and scenario scorecards land in the next roadmap tranche.</p>
              <span>Locked for a later milestone</span>
            </article>
          </div>
        </Modal>
      )}

      {showOptions && (
        <Modal title="Options" onClose={() => setShowOptions(false)}>
          <div className="settings-grid">
            <label className="toggle-row">
              <span>Music</span>
              <input
                type="checkbox"
                checked={options.musicEnabled}
                onChange={(event) => setOptions((current) => ({ ...current, musicEnabled: event.target.checked }))}
              />
            </label>
            <label className="toggle-row">
              <span>Sound effects</span>
              <input
                type="checkbox"
                checked={options.soundEnabled}
                onChange={(event) => setOptions((current) => ({ ...current, soundEnabled: event.target.checked }))}
              />
            </label>
            <label className="toggle-row">
              <span>Reduced motion</span>
              <input
                type="checkbox"
                checked={options.reducedMotion}
                onChange={(event) => setOptions((current) => ({ ...current, reducedMotion: event.target.checked }))}
              />
            </label>
            <label className="slider-row">
              <span>Master volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={options.masterVolume}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, masterVolume: Number(event.target.value) }))
                }
              />
              <strong>{Math.round(options.masterVolume * 100)}%</strong>
            </label>
          </div>
        </Modal>
      )}

      {showHelp && (
        <Modal title="Help" onClose={() => setShowHelp(false)}>
          <div className="help-stack">
            {activeScenario.helpSections.map((section) => (
              <article key={section.title} className="help-card">
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </article>
            ))}
              <article className="help-card">
                <h3>Keyboard</h3>
                <p>
                  `1-7` switch tools, `X` selects bulldoze, `Space` toggles pause, and `,` `.` `/`
                  switch between 1x, 2x, and 3x speed.
                </p>
              </article>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MetricBar({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "mint" | "cyan" | "gold" | "warm";
}) {
  return (
    <div className="metric-row">
      <div className="metric-label">
        <span>{label}</span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <div className="metric-track">
        <div className={`metric-fill accent-${accent}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay-backdrop">
      <section className="panel modal-card">
        <header className="modal-header">
          <div>
            <p className="micro-label">Civicrise</p>
            <h2>{title}</h2>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export default App;
