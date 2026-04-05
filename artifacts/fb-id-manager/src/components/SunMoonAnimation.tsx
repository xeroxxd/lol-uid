import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const ANGLE = 70;
const SWING = 0.45;

export function SunMoonAnimation({ className = "" }: { className?: string }) {
  const [isDay, setIsDay] = useState(true);
  const sunControls = useAnimation();
  const moonControls = useAnimation();
  const bgControls = useAnimation();

  useEffect(() => {
    let cancelled = false;

    async function runLoop() {
      while (!cancelled) {
        // ---- DAY phase: sun swings in, moon swings out ----
        setIsDay(true);
        await Promise.all([
          sunControls.start({
            rotate: 0,
            transition: { duration: SWING, ease: [0.77, 0, 0.175, 1] },
          }),
          moonControls.start({
            rotate: ANGLE,
            transition: { duration: SWING, ease: [0.77, 0, 0.175, 1] },
          }),
        ]);

        await new Promise((r) => setTimeout(r, 700));

        // ---- NIGHT phase: moon swings back in, sun swings out ----
        setIsDay(false);
        await Promise.all([
          moonControls.start({
            rotate: 0,
            transition: { duration: SWING, ease: [0.77, 0, 0.175, 1] },
          }),
          sunControls.start({
            rotate: -ANGLE,
            transition: { duration: SWING, ease: [0.77, 0, 0.175, 1] },
          }),
        ]);

        await new Promise((r) => setTimeout(r, 700));
      }
    }

    // Initial positions
    sunControls.set({ rotate: -ANGLE });
    moonControls.set({ rotate: 0 });

    runLoop();
    return () => { cancelled = true; };
  }, [sunControls, moonControls]);

  const bg = isDay
    ? "hsl(200,80%,60%)"
    : "hsl(220,25%,18%)";

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        background: bg,
        transition: `background ${SWING * 2}s ease-in-out`,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 140.22917 47.625001"
        style={{ display: "block", width: "95vmin", maxWidth: 480 }}
      >
        <g transform="translate(30.4270831 -253.30314617)">

          {/* Static clouds in background */}
          <path
            d="M28.400015 276.59647a1.904456 1.904456 0 00-1.374592.55759 1.904456 1.904456 0 00-.458886.74363 1.904456 1.904456 0 00-2.1947.35605 1.904456 1.904456 0 00-.35605 2.19624 1.904456 1.904456 0 00-.743624.45734 1.904456 1.904456 0 000 2.69338 1.904456 1.904456 0 00.743624.4594 1.904456 1.904456 0 00.35605 2.1947 1.904456 1.904456 0 002.196251.35605 1.904456 1.904456 0 00.457335.74311 1.904456 1.904456 0 002.693376 0 1.904456 1.904456 0 00.45940-.74363 1.904456 1.904456 0 002.194699-.35605 1.904456 1.904456 0 00.35605-2.1947 1.904456 1.904456 0 00.743623-.4594 1.904456 1.904456 0 000-2.69338 1.904456 1.904456 0 00-.743623-.45734 1.904456 1.904456 0 00-.35605-2.19624 1.904456 1.904456 0 00-2.194699-.35605 1.904456 1.904456 0 00-.457852-.74363 1.904456 1.904456 0 00-1.318783-.55759z"
            fill={isDay ? "hsl(0,0%,100%)" : "hsl(0,0%,75%)"}
            style={{ transition: `fill ${SWING * 2}s ease-in-out` }}
          />
          <path
            d="M39.715405 276.66449a1.904456 1.904456 0 00-1.374592.55759 1.904456 1.904456 0 00-.458886.74363 1.904456 1.904456 0 00-2.1947.35605 1.904456 1.904456 0 00-.35605 2.19624 1.904456 1.904456 0 00-.743624.45734 1.904456 1.904456 0 000 2.69338 1.904456 1.904456 0 00.743624.4594 1.904456 1.904456 0 00.35605 2.1947 1.904456 1.904456 0 002.196251.35605 1.904456 1.904456 0 00.457335.74311 1.904456 1.904456 0 002.693376 0 1.904456 1.904456 0 00.45940-.74363 1.904456 1.904456 0 002.194699-.35605 1.904456 1.904456 0 00.35605-2.1947 1.904456 1.904456 0 00.743623-.4594 1.904456 1.904456 0 000-2.69338 1.904456 1.904456 0 00-.743623-.45734 1.904456 1.904456 0 00-.35605-2.19624 1.904456 1.904456 0 00-2.194699-.35605 1.904456 1.904456 0 00-.457852-.74363 1.904456 1.904456 0 00-1.318783-.55759z"
            fill={isDay ? "hsl(0,0%,100%)" : "hsl(0,0%,75%)"}
            style={{ transition: `fill ${SWING * 2}s ease-in-out` }}
          />
          <path
            d="M51.030797 276.66449a1.904456 1.904456 0 00-1.374592.55759 1.904456 1.904456 0 00-.458886.74363 1.904456 1.904456 0 00-2.1947.35605 1.904456 1.904456 0 00-.35605 2.19624 1.904456 1.904456 0 00-.743624.45734 1.904456 1.904456 0 000 2.69338 1.904456 1.904456 0 00.743624.4594 1.904456 1.904456 0 00.35605 2.1947 1.904456 1.904456 0 002.196251.35605 1.904456 1.904456 0 00.457335.74311 1.904456 1.904456 0 002.693376 0 1.904456 1.904456 0 00.45940-.74363 1.904456 1.904456 0 002.194699-.35605 1.904456 1.904456 0 00.35605-2.1947 1.904456 1.904456 0 00.743623-.4594 1.904456 1.904456 0 000-2.69338 1.904456 1.904456 0 00-.743623-.45734 1.904456 1.904456 0 00-.35605-2.19624 1.904456 1.904456 0 00-2.194699-.35605 1.904456 1.904456 0 00-.457852-.74363 1.904456 1.904456 0 00-1.318783-.55759z"
            fill={isDay ? "hsl(0,0%,100%)" : "hsl(0,0%,75%)"}
            style={{ transition: `fill ${SWING * 2}s ease-in-out` }}
          />

          {/* ---- SUN GROUP (pivots from top) ---- */}
          <motion.g
            animate={sunControls}
            style={{ transformOrigin: "77.65% -200%" }}
          >
            {/* Sun rays */}
            {Array.from({ length: 8 }, (_, i) => (
              <motion.g
                key={i}
                style={{ transformOrigin: "77.65px 270.4px" }}
                animate={{ rotate: (360 / 8) * i + 5 + (isDay ? 0 : 90) }}
                transition={{ duration: SWING * 2, ease: "easeInOut" }}
              >
                <rect
                  ry="0.85"
                  y="266.68771"
                  x="76.802017"
                  height="6.7336116"
                  width="1.700407"
                  fill={isDay
                    ? "hsl(50,85%,50%)"
                    : "hsl(50,0%,75%)"}
                  style={{ transition: `fill ${SWING * 2}s ease-in-out` }}
                />
              </motion.g>
            ))}
            {/* Sun circle */}
            <ellipse
              cx="77.65"
              cy="270.05"
              rx="4"
              ry="4"
              fill={isDay ? "hsl(50,85%,50%)" : "hsl(50,0%,75%)"}
              style={{ transition: `fill ${SWING * 2}s ease-in-out` }}
            />
            {/* Sun cloud (fades in at night) */}
            <path
              d="M77.680127 264.39695a1.904456 1.904456 0 00-1.374592.55759 1.904456 1.904456 0 00-.458886.74363 1.904456 1.904456 0 00-2.1947.35605 1.904456 1.904456 0 00-.35605 2.19624 1.904456 1.904456 0 00-.743624.45734 1.904456 1.904456 0 000 2.69338 1.904456 1.904456 0 00.743624.4594 1.904456 1.904456 0 00.35605 2.1947 1.904456 1.904456 0 002.196251.35605 1.904456 1.904456 0 00.457335.74311 1.904456 1.904456 0 002.693376 0 1.904456 1.904456 0 00.459404-.74363 1.904456 1.904456 0 002.194699-.35605 1.904456 1.904456 0 00.35605-2.1947 1.904456 1.904456 0 00.743623-.4594 1.904456 1.904456 0 000-2.69338 1.904456 1.904456 0 00-.743623-.45734 1.904456 1.904456 0 00-.35605-2.19624 1.904456 1.904456 0 00-2.194699-.35605 1.904456 1.904456 0 00-.457852-.74363 1.904456 1.904456 0 00-1.318783-.55759z"
              fill="white"
              opacity={isDay ? 0 : 0.9}
              style={{ transition: `opacity ${SWING}s ease-in-out` }}
            />
          </motion.g>

          {/* ---- MOON GROUP (pivots from top) ---- */}
          <motion.g
            animate={moonControls}
            style={{ transformOrigin: "17.08% -170%" }}
          >
            {/* Moon circle */}
            <ellipse
              cx="17.08"
              cy="282.25"
              rx="5.65"
              ry="5.65"
              fill={isDay ? "hsl(0,0%,95%)" : "hsl(220,15%,88%)"}
              style={{ transition: `fill ${SWING * 2}s ease-in-out` }}
            />
            {/* Moon crescent shadow */}
            <ellipse
              cx="19.5"
              cy="280.5"
              rx="4"
              ry="4"
              fill={isDay ? "hsl(200,80%,60%)" : "hsl(220,25%,18%)"}
              style={{ transition: `fill ${SWING * 2}s ease-in-out` }}
            />

            {/* Moon cloud (day mode) */}
            <path
              d="M17.084716 276.596488a1.904456 1.904456 0 00-1.374592.55759 1.904456 1.904456 0 00-.458886.74363 1.904456 1.904456 0 00-2.1947.35605 1.904456 1.904456 0 00-.35605 2.19624 1.904456 1.904456 0 00-.743624.45734 1.904456 1.904456 0 000 2.69338 1.904456 1.904456 0 00.743624.4594 1.904456 1.904456 0 00.35605 2.1947 1.904456 1.904456 0 002.196251.35605 1.904456 1.904456 0 00.457335.74311 1.904456 1.904456 0 002.693376 0 1.904456 1.904456 0 00.459404-.74363 1.904456 1.904456 0 002.194699-.35605 1.904456 1.904456 0 00.35605-2.1947 1.904456 1.904456 0 00.743623-.4594 1.904456 1.904456 0 000-2.69338 1.904456 1.904456 0 00-.743623-.45734 1.904456 1.904456 0 00-.35605-2.19624 1.904456 1.904456 0 00-2.194699-.35605 1.904456 1.904456 0 00-.457852-.74363 1.904456 1.904456 0 00-1.318783-.55759z"
              fill="white"
              opacity={isDay ? 0.85 : 0}
              style={{ transition: `opacity ${SWING}s ease-in-out` }}
            />

            {/* Stars (appear at night) */}
            <g opacity={isDay ? 0 : 1} style={{ transition: `opacity ${SWING}s ease-in-out ${SWING * 0.5}s` }}>
              <motion.g
                animate={{ scale: isDay ? 0 : 1, rotate: isDay ? 0 : -ANGLE }}
                transition={{ duration: SWING, ease: [0.77, 0, 0.175, 1] }}
                style={{ transformOrigin: "12px 285px" }}
              >
                <polygon points="5.5,278.4 5.7,279 6.3,279 5.8,279.4 6,280 5.5,279.6 5,280 5.2,279.4 4.7,279 5.3,279" fill="#d2ccac" />
              </motion.g>
              <motion.g
                animate={{ scale: isDay ? 0 : 1, rotate: isDay ? 0 : -ANGLE }}
                transition={{ duration: SWING, ease: [0.77, 0, 0.175, 1], delay: 0.05 }}
                style={{ transformOrigin: "4px 293px" }}
              >
                <polygon points="3.5,291.9 3.7,292.5 4.3,292.5 3.8,292.9 4,293.5 3.5,293.1 3,293.5 3.2,292.9 2.7,292.5 3.3,292.5" fill="#d2ccac" />
              </motion.g>
              <motion.g
                animate={{ scale: isDay ? 0 : 1, rotate: isDay ? 0 : -ANGLE }}
                transition={{ duration: SWING, ease: [0.77, 0, 0.175, 1], delay: 0.1 }}
                style={{ transformOrigin: "20px 294px" }}
              >
                <polygon points="19.5,292.9 19.7,293.5 20.3,293.5 19.8,293.9 20,294.5 19.5,294.1 19,294.5 19.2,293.9 18.7,293.5 19.3,293.5" fill="#d2ccac" />
              </motion.g>
            </g>

            {/* Clouds (appear at night) */}
            <motion.g
              animate={{ scale: isDay ? 0 : 1, rotate: isDay ? 0 : -ANGLE }}
              transition={{ duration: SWING, ease: [0.77, 0, 0.175, 1] }}
              style={{ transformOrigin: "15px 284px" }}
            >
              <path
                d="M12.976038 277.820928a5.7937272 5.7937272 0 00-5.7763908 5.44153 3.4811737 3.4811737 0 00-.8211396-.10232 3.4811737 3.4811737 0 00-3.4814406 3.48092 3.4811737 3.4811737 0 003.4814406 3.48145H23.212106a3.1751005 3.1751005 0 003.175516-3.17552 3.1751005 3.1751005 0 00-3.133659-3.17293 3.9572877 3.9572877 0 00.0047-.0915 3.9572877 3.9572877 0 00-3.957381-3.95738 3.9572877 3.9572877 0 00-1.711523.39326 5.7937272 5.7937272 0 00-4.613672-2.29754z"
                fill="#bfbfbf"
              />
            </motion.g>
          </motion.g>

        </g>
      </svg>
    </div>
  );
}
