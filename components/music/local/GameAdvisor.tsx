"use client";

import type {
  LocalMusicGameAdvisor,
} from "@/lib/music/local/game-builder";

export type GameAdvisorProps = {
  advisor: LocalMusicGameAdvisor | null;
  loading?: boolean;
};

function formatNumber(
  value: number
): string {
  return value.toLocaleString(
    "en-US"
  );
}

function getStatusLabel(
  readiness: LocalMusicGameAdvisor["readiness"]
): string {
  if (readiness === "ready") {
    return "Ready to Create";
  }

  if (readiness === "warning") {
    return "Review Recommended";
  }

  return "More Songs Required";
}

export default function GameAdvisor({
  advisor,
  loading = false,
}: GameAdvisorProps) {
  if (loading) {
    return (
      <section
        aria-labelledby="local-game-advisor-title"
        aria-busy="true"
      >
        <h2 id="local-game-advisor-title">
          Game Advisor
        </h2>

        <p>
          Reviewing your music
          selection...
        </p>
      </section>
    );
  }

  if (!advisor) {
    return (
      <section
        aria-labelledby="local-game-advisor-title"
      >
        <h2 id="local-game-advisor-title">
          Game Advisor
        </h2>

        <p>
          Select a playlist to check
          whether it has enough music
          for a game.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="local-game-advisor-title"
    >
      <div>
        <div>
          <p>GAME ADVISOR</p>

          <h2 id="local-game-advisor-title">
            {getStatusLabel(
              advisor.readiness
            )}
          </h2>
        </div>

        <span>
          {advisor.readiness.toUpperCase()}
        </span>
      </div>

      <div role="list">
        <div role="listitem">
          <span>Available Songs</span>
          <strong>
            {formatNumber(
              advisor.availableTrackCount
            )}
          </strong>
        </div>

        <div role="listitem">
          <span>Selected Songs</span>
          <strong>
            {formatNumber(
              advisor.selectedTrackCount
            )}
          </strong>
        </div>

        <div role="listitem">
          <span>Minimum Required</span>
          <strong>
            {formatNumber(
              advisor.minimumTrackCount
            )}
          </strong>
        </div>

        <div role="listitem">
          <span>Recommended</span>
          <strong>
            {formatNumber(
              advisor.idealTrackCount
            )}
          </strong>
        </div>
      </div>

      {advisor.issues.length > 0 ? (
        <div>
          <h3>Items to Review</h3>

          <ul>
            {advisor.issues.map(
              (issue) => (
                <li key={issue}>
                  {issue}
                </li>
              )
            )}
          </ul>
        </div>
      ) : null}

      <div>
        <h3>Recommendations</h3>

        <ul>
          {advisor.recommendations.map(
            (recommendation) => (
              <li key={recommendation}>
                {recommendation}
              </li>
            )
          )}
        </ul>
      </div>

      <dl>
        <div>
          <dt>Duplicate songs</dt>
          <dd>
            {formatNumber(
              advisor.duplicateTrackCount
            )}
          </dd>
        </div>

        <div>
          <dt>Unreadable songs</dt>
          <dd>
            {formatNumber(
              advisor.unreadableTrackCount
            )}
          </dd>
        </div>

        <div>
          <dt>Missing artists</dt>
          <dd>
            {formatNumber(
              advisor.missingArtistCount
            )}
          </dd>
        </div>

        <div>
          <dt>Missing titles</dt>
          <dd>
            {formatNumber(
              advisor.missingTitleCount
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
