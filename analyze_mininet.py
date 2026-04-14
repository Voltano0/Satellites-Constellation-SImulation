#!/usr/bin/env python3
"""
Analyse un fichier mininet JSON (format mininet-isl-gs-timeseries v4.0)
et affiche les métriques clés : latences ISL intra/inter-plan, statistiques GS.
"""

import json
import sys
import statistics
from collections import defaultdict


def fmt(val, decimals=3, unit=""):
    return f"{val:.{decimals}f}{(' ' + unit) if unit else ''}"


def percentile(data, p):
    sorted_data = sorted(data)
    idx = (p / 100) * (len(sorted_data) - 1)
    lo, hi = int(idx), min(int(idx) + 1, len(sorted_data) - 1)
    return sorted_data[lo] + (sorted_data[hi] - sorted_data[lo]) * (idx - lo)


def print_section(title):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print('=' * 60)


def analyze(path: str):
    print(f"Chargement de : {path}")
    with open(path) as f:
        data = json.load(f)

    # ------------------------------------------------------------------ #
    #  METADATA                                                            #
    # ------------------------------------------------------------------ #
    print_section("CONSTELLATION & SIMULATION")
    meta = data["metadata"]
    cst = meta["constellation"]
    sim = meta["simulation"]
    sim_duration = sim["duration_s"]

    print(f"  Export          : {meta['exportDate']}")
    print(f"  Satellites      : {cst['totalSatellites']}  "
          f"({cst['planes']} plans × {cst['totalSatellites'] // cst['planes']} sats/plan)")
    print(f"  Altitude        : {cst['altitude_km']} km")
    print(f"  Inclinaison     : {cst['inclination_deg']}°")
    print(f"  Période orbitale: {fmt(sim['orbitalPeriod_min'], 2)} min")
    print(f"  Durée sim.      : {fmt(sim['duration_s'] / 3600, 2)} h  "
          f"({sim['numPeriods']} périodes)")
    print(f"  Echantillonnage : {sim['samplingInterval_s']} s")

    # ------------------------------------------------------------------ #
    #  ISL LINKS — statistiques globales (depuis le champ statistics)      #
    # ------------------------------------------------------------------ #
    print_section("LIENS ISL — STATISTIQUES GLOBALES")
    stats = data["statistics"]
    print(f"  Liens ISL total     : {stats['totalISLLinks']}")
    print(f"    Intra-plan        : {stats['intraPlaneLinks']}")
    print(f"    Inter-plan        : {stats['interPlaneLinks']}")
    print(f"  Latence moy. intra  : {fmt(stats['avgLatencyIntraPlane_ms'], 3)} ms")
    print(f"  Latence moy. inter  : {fmt(stats['avgLatencyInterPlane_ms'], 3)} ms")
    print(f"  Latence moy. totale : {fmt(stats['avgLatencyOverall_ms'], 3)} ms")

    # ------------------------------------------------------------------ #
    #  ISL LINKS — calcul détaillé depuis les données brutes               #
    # ------------------------------------------------------------------ #
    # Structure :
    #   intra-plan → {"distance_km": x, "latency_ms": y}  (valeur fixe)
    #   inter-plan → {"timeSeries": [[t, dist, lat], ...]} (variable)
    print_section("LIENS ISL — DÉTAIL PAR TYPE")
    isl_links = data["islLinks"]

    intra_lat, inter_lat = [], []
    intra_dist, inter_dist = [], []

    for link in isl_links:
        if link["type"] == "intra-plane":
            intra_lat.append(link["latency_ms"])
            intra_dist.append(link["distance_km"])
        else:
            for sample in link["timeSeries"]:
                # sample = [timestamp, distance_km, latency_ms]
                inter_dist.append(sample[1])
                inter_lat.append(sample[2])

    for label, lats, dists in [
        ("Intra-plan (liens fixes)", intra_lat, intra_dist),
        ("Inter-plan (échantillons temporels)", inter_lat, inter_dist),
    ]:
        if not lats:
            continue
        print(f"\n  [{label}]")
        print(f"    Nombre d'échantillons : {len(lats)}")
        print(f"    Latence  moy.         : {fmt(statistics.mean(lats), 3)} ms")
        print(f"    Latence  médiane      : {fmt(statistics.median(lats), 3)} ms")
        print(f"    Latence  min          : {fmt(min(lats), 3)} ms")
        print(f"    Latence  max          : {fmt(max(lats), 3)} ms")
        if len(lats) > 1:
            print(f"    Latence  σ            : {fmt(statistics.stdev(lats), 3)} ms")
        print(f"    Latence  p95          : {fmt(percentile(lats, 95), 3)} ms")
        print(f"    Distance moy.         : {fmt(statistics.mean(dists), 1)} km")
        print(f"    Distance min          : {fmt(min(dists), 1)} km")
        print(f"    Distance max          : {fmt(max(dists), 1)} km")

    # ------------------------------------------------------------------ #
    #  GROUND STATIONS — statistiques globales                            #
    # ------------------------------------------------------------------ #
    print_section("STATIONS SOL — STATISTIQUES GLOBALES")
    gs_stats = data["gsStatistics"]
    print(f"  Stations sol        : {gs_stats['totalGroundStations']}")
    print(f"  Événements total    : {gs_stats['totalEvents']}")
    print(f"    Connexions        : {gs_stats['connectEvents']}")
    print(f"    Handovers         : {gs_stats['handoverEvents']}")
    print(f"    Déconnexions      : {gs_stats['disconnectEvents']}")
    print(f"  Latence GS moy.     : {fmt(gs_stats['avgLatency_ms'], 3)} ms")
    print(f"  Échantillons GS     : {gs_stats['totalSamples']}")

    # ------------------------------------------------------------------ #
    #  GROUND STATIONS — analyse par station depuis la timeline           #
    # ------------------------------------------------------------------ #
    print_section("STATIONS SOL — DÉTAIL PAR STATION")
    timeline = data["gsLinks"]["timeline"]

    # Liste complète des GS depuis la topologie
    all_gs_ids = {gs["id"] for gs in data["topology"].get("groundStations", [])}

    gs_data = {gs_id: {"latencies": [], "durations_s": [], "nb_connexions": 0, "sats_vus": set()}
               for gs_id in all_gs_ids}

    for segment in timeline:
        gs_id = segment["gsId"]
        sat_id = segment["satId"]
        start = segment["startTime"]
        end = segment["endTime"] if segment["endTime"] is not None else sim_duration
        duration = end - start
        lats = [s[1] for s in segment["samples"]]

        gs_data[gs_id]["latencies"].extend(lats)
        gs_data[gs_id]["durations_s"].append(duration)
        gs_data[gs_id]["nb_connexions"] += 1
        gs_data[gs_id]["sats_vus"].add(sat_id)

    # En-tête tableau
    header = (
        f"  {'Station':<10} {'Connex':>6} {'Sats':>5} "
        f"{'Lat.moy(ms)':>11} {'Lat.min':>8} {'Lat.max':>8} "
        f"{'Durée moy(s)':>12} {'Couverture':>10}"
    )
    print(header)
    print("  " + "-" * (len(header) - 2))

    all_latencies = []
    all_coverages = []

    for gs_id in sorted(gs_data.keys(), key=lambda x: int(x[2:])):
        g = gs_data[gs_id]
        lats = g["latencies"]
        durs = g["durations_s"]
        total_connected = sum(durs)
        coverage = (total_connected / sim_duration) * 100

        all_latencies.extend(lats)
        all_coverages.append(coverage)

        if not lats:
            # GS jamais connectée
            print(
                f"  {gs_id:<10} {0:>6} {0:>5} "
                f"  {'—':>9}   {'—':>6}   {'—':>6} "
                f"  {'—':>10}   {0.0:>7.1f}%"
            )
        else:
            print(
                f"  {gs_id:<10} {g['nb_connexions']:>6} {len(g['sats_vus']):>5} "
                f"  {statistics.mean(lats):>9.3f}   {min(lats):>6.3f}   {max(lats):>6.3f} "
                f"  {statistics.mean(durs):>10.1f}   {coverage:>8.1f}%"
            )

    # ------------------------------------------------------------------ #
    #  SYNTHÈSE GROUND STATIONS                                           #
    # ------------------------------------------------------------------ #
    print_section("SYNTHÈSE STATIONS SOL")
    print(f"  Latence GS globale moy.   : {fmt(statistics.mean(all_latencies), 3)} ms")
    print(f"  Latence GS globale médiane: {fmt(statistics.median(all_latencies), 3)} ms")
    print(f"  Latence GS p95            : {fmt(percentile(all_latencies, 95), 3)} ms")
    print(f"  Latence GS p99            : {fmt(percentile(all_latencies, 99), 3)} ms")
    print(f"  Latence GS min            : {fmt(min(all_latencies), 3)} ms")
    print(f"  Latence GS max            : {fmt(max(all_latencies), 3)} ms")
    print(f"  Couverture moy./station   : {fmt(statistics.mean(all_coverages), 1)} %")
    print(f"  Couverture min            : {fmt(min(all_coverages), 1)} %")
    print(f"  Couverture max            : {fmt(max(all_coverages), 1)} %")

    # ------------------------------------------------------------------ #
    #  HANDOVERS — fréquence                                              #
    # ------------------------------------------------------------------ #
    print_section("HANDOVERS")
    events = data["gsLinks"]["events"]
    handovers_per_gs = defaultdict(int)
    for ev in events:
        if ev["action"] == "handover":
            handovers_per_gs[ev["gsId"]] += 1

    if handovers_per_gs:
        total_ho = sum(handovers_per_gs.values())
        avg_ho = total_ho / gs_stats["totalGroundStations"]
        sim_hours = sim_duration / 3600
        print(f"  Total handovers           : {total_ho}")
        print(f"  Handovers moy./station    : {fmt(avg_ho, 1)}")
        print(f"  Fréquence handover        : {fmt(avg_ho / sim_hours, 2)} /h/station")
        most_active = max(handovers_per_gs, key=handovers_per_gs.get)
        least_active = min(handovers_per_gs, key=handovers_per_gs.get)
        print(f"  Station + active          : {most_active} ({handovers_per_gs[most_active]} HO)")
        print(f"  Station - active          : {least_active} ({handovers_per_gs[least_active]} HO)")

    print()


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "mininet_isl_gs_timeseries_2026-04-12T13-51-52.json"
    analyze(path)
