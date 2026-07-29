import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About the data - Firefinder",
  description:
    "How Firefinder turns free public satellite, weather and grid data into weekly wildfire risk forecasts for power line corridors.",
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-12 text-xl font-semibold tracking-tight text-slate-900">
      {children}
    </h2>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-800 hover:decoration-orange-500"
    >
      {children}
    </a>
  );
}

function Source({
  name,
  href,
  children,
}: {
  name: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-200 py-4 first:border-t-0">
      <dt className="font-semibold text-slate-900">
        <ExternalLink href={href}>{name}</ExternalLink>
      </dt>
      <dd className="mt-1 text-slate-600">{children}</dd>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-white text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-8 w-8 shrink-0" />
            <span>
              <span className="text-orange-600">fire</span>finder
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-orange-700 hover:text-orange-800"
          >
            &larr; Back to the map
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 [&_p]:leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          About the data
        </h1>
        <p className="mt-2 text-lg text-slate-500">
          What you are looking at, where it comes from, and what it can and
          cannot tell you.
        </p>

        <SectionHeading>What is this?</SectionHeading>
        <div className="mt-3 space-y-3">
          <p>
            Firefinder shows weekly wildfire ignition risk along power-grid
            corridors for Portugal, Spain and France. The
            country is divided into hexagons of roughly 5 km&sup2;, and every
            week each hexagon gets a probability that a fire starts there,
            computed from satellite imagery, weather, terrain and land cover.
          </p>
          <p>
            That risk is then rolled up onto every power line corridor in the
            national grid and ranked, because vegetation near power lines is a
            leading cause of both wildfires and large-scale outages. Knowing
            which corridors to worry about this week is more useful than
            knowing which regions are generally fire-prone.
          </p>
          <p>
            Everything is built from free public data, and the whole project is
            open source.
          </p>
        </div>

        <SectionHeading>The data sources</SectionHeading>
        <dl className="mt-4">
          <Source
            name="Sentinel-2 (ESA, via AWS Open Data)"
            href="https://registry.opendata.aws/sentinel-2-l2a-cogs/"
          >
            Raw satellite imagery at 10 to 20 m resolution. We do our own cloud
            masking and build monthly composites of vegetation greenness (NDVI)
            and moisture (NDMI). The current month is rebuilt daily as new
            scenes arrive.
          </Source>
          <Source name="ERA5 reanalysis via Open-Meteo" href="https://open-meteo.com/">
            Daily temperature, humidity, wind and rain, with{" "}
            <ExternalLink href="https://power.larc.nasa.gov/">
              NASA POWER
            </ExternalLink>{" "}
            as a fallback source. New days are appended daily.
          </Source>
          <Source
            name="EFFIS (Copernicus Emergency Management)"
            href="https://forest-fire.emergency.copernicus.eu/"
          >
            Official European burnt-area perimeters since 2016. These are both
            the labels the model learns from and the historical fires layer in
            the app. Refreshed daily.
          </Source>
          <Source name="NASA FIRMS" href="https://firms.modaps.eosdis.nasa.gov/">
            Live satellite fire detections from the VIIRS instruments on the
            Suomi NPP and NOAA-20 satellites, with roughly 3 hours of latency
            and a 375 m pixel, refreshed every 15 minutes in the app. To be
            clear about what a detection is: a satellite seeing heat. The
            position is approximate to about 375 m, small or brief fires can be
            missed entirely, and false positives happen (industrial heat, gas
            flares).
          </Source>
          <Source name="OpenStreetMap" href="https://www.openstreetmap.org/">
            The power grid itself: transmission and distribution lines with
            voltage and operator, split into corridors of up to 5 km and named
            by the nearest town.
          </Source>
          <Source
            name="Copernicus DEM and ESA WorldCover"
            href="https://registry.opendata.aws/copernicus-dem/"
          >
            Elevation and slope from the Copernicus digital elevation model,
            and land-cover fractions (tree, shrub, grass, crop, built-up) from{" "}
            <ExternalLink href="https://esa-worldcover.org/">
              ESA WorldCover
            </ExternalLink>{" "}
            as proxies for the fuel available to a fire.
          </Source>
        </dl>

        <SectionHeading>The forecasting model</SectionHeading>
        <div className="mt-3 space-y-3">
          <p>
            The forecasts come from gradient-boosted decision trees (XGBoost)
            trained on nearly a decade of fire history. For each hexagon and
            week, the model weighs 21 factors: how dry and stressed the
            vegetation looks from space, the week&apos;s fire weather, drought
            over the last 30 and 90 days, how steep the terrain is, what kinds
            of fuel cover the ground, distance to power lines, and the time of
            the fire season.
          </p>
          <p>
            Some honest numbers. Ignition in any given cell in any given week
            is rare: between roughly 1 in 700 and 1 in 12,000 depending on the
            country. The model ranks risk well (ROC-AUC of 0.85 for Portugal,
            0.86 for Spain and 0.90 for France, measured on held-out years it
            never saw during training),
            but absolute probabilities at base rates this low are hard. That is
            why the app talks in tiers (Severe, High, and so on) rather than
            pretending to a precision the data cannot support.
          </p>
          <p>
            The &quot;why&quot; bars you see when you click a corridor or cell
            are SHAP attributions: the model&apos;s own accounting of which
            factor pushed the score up or down for that place and week.
          </p>
          <p>
            Limitations, stated plainly: the weather used is observed, not
            forecast. Small fires are missing from the training labels.
            And corridor risk means fire risk near the line, not a claim that
            the line causes fires; no public European dataset attributes
            ignitions to grid equipment, so that distinction is beyond what
            open data can support.
          </p>
        </div>

        <SectionHeading>Corridor scoring</SectionHeading>
        <p className="mt-3">
          Cells within 500 m of a power line contribute to that corridor&apos;s
          score, weighted as 0.65 times the worst cell plus 0.35 times the
          average, so a corridor through one severe spot matters more than one
          through many mild ones. Corridors are ranked nationally each week.
        </p>

        <SectionHeading>How fresh is what you see</SectionHeading>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-900">
                <th className="py-2 pr-4 font-semibold">Layer</th>
                <th className="py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              <tr className="border-b border-slate-200">
                <td className="py-2 pr-4">Risk scores (cells and corridors)</td>
                <td className="py-2">
                  Daily at 05:00 UTC, via a public GitHub Actions run
                </td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 pr-4">Live fire detections</td>
                <td className="py-2">Every 15 minutes while the app is open</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 pr-4">Historical fire perimeters</td>
                <td className="py-2">Daily</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Grid geometry and terrain</td>
                <td className="py-2">Static</td>
              </tr>
            </tbody>
          </table>
        </div>

        <SectionHeading>Open source</SectionHeading>
        <p className="mt-3">
          Everything (the data pipeline, the model, and this app) lives at{" "}
          <ExternalLink href="https://github.com/davidcoallier/firefinder.eu">
            github.com/davidcoallier/firefinder.eu
          </ExternalLink>
          , with instructions to run the whole thing yourself. All the data
          sources are free and require no API keys. Issues and pull requests
          are welcome.
        </p>

        <p className="mt-14 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
          Contains modified Copernicus Sentinel data. EFFIS &copy; European
          Union. Fire detections courtesy of NASA FIRMS. Map data &copy;
          OpenStreetMap contributors. Satellite basemap &copy; Esri, Maxar,
          Earthstar Geographics.
        </p>
      </main>
    </div>
  );
}
