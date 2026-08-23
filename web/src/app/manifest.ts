import type { MetadataRoute } from "next";

/**
 * PWA manifest. The handoff calls for a PWA, and the practical reason is the
 * gym: installed to the home screen the app opens without browser chrome, and
 * the local-first cache means it still works when the signal does not.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gym App",
    short_name: "Gym App",
    description:
      "Workouts, meals and recovery built around your week — designed for over-40s.",
    start_url: "/home",
    display: "standalone",
    orientation: "portrait",
    // Matches --color-bg / --color-accent in the Industry token sheet.
    background_color: "#f2f2f3",
    theme_color: "#5980a6",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
