# Energy Card

Eine Home-Assistant-Karte mit animierten Energieflüssen über einer 3D-Szene:
PV-Anlage, Batterie, Haus, Netz, Wechselrichter und Auto.

- Animierte Flüsse (Komet, Striche oder Punkte), Tempo passt sich der Leistung an
- Werte-Boxen mit Tagesertrag, Netzbezug und -einspeisung
- Batterie-Ladestand als leuchtender 6-Segment-Balken
- Popups mit beliebigen Sensoren; Schalter und Lichter lassen sich direkt schalten
- Auto-Bild direkt aus einem HA-Bild-Entity (z. B. MySkoda), mit Spiegelung auf dem Boden
- Eigene Bilder für Batterie und Wechselrichter möglich
- Keine Paywall, keine Server-Abfragen, keine Werbung. Die Karte lädt nur ihre eigenen Dateien.

## Installation

### Über HACS (empfohlen)

1. HACS → ⋮ (oben rechts) → **Benutzerdefinierte Repositories**
2. URL `https://github.com/RonnyGrueninger/energy-card`, Typ **Dashboard**
3. „Energy Card“ installieren und den Browser neu laden (Strg+F5)

### Manuell

Den Inhalt von `dist/` nach `/config/www/energy-card/` kopieren und unter
Einstellungen → Dashboards → ⋮ → Ressourcen
`/local/energy-card/energy-card.js` als **JavaScript-Modul** hinzufügen.

## Minimale Konfiguration

```yaml
type: custom:energy-card
pv:
  entity: sensor.pv_power
battery:
  soc: sensor.battery_soc
  power: sensor.battery_power
grid:
  entity: sensor.grid_power
home:
  entity: sensor.house_consumption
```

Ein vollständiges Beispiel für GoodWe und MySkoda steht in
[`examples/goodwe-skoda.yaml`](examples/goodwe-skoda.yaml).

## Vorzeichen

| Wert | Bedeutung in der Karte | Wenn dein Sensor es andersherum meldet |
|---|---|---|
| `battery.power` | positiv = Batterie lädt | `battery.invert: true` (z. B. GoodWe) |
| `grid.entity` | positiv = Bezug aus dem Netz | `grid.invert: true` (z. B. GoodWe `active_power`) |
| `car.power` | positiv = Auto lädt | `car.invert: true` |

Leistung darf in W oder kW kommen, Energie in Wh oder kWh. Die Karte rechnet um.
Ohne `home.entity` berechnet die Karte den Hausverbrauch aus PV, Netz und Batterie.

## Optionen

### Bereiche

| Bereich | Optionen |
|---|---|
| `pv` | `entity`, `daily` (Tagesertrag), `name`, `popup` |
| `battery` | `soc`, `power`, `invert`, `name`, `popup`, `image`, `soc_bar` (`false` = aus), `soc_face` |
| `home` | `entity`, `name`, `popup` |
| `grid` | `entity`, `invert`, `daily_import`, `daily_export`, `name`, `popup` |
| `car` | `power`, `soc`, `status`, `name`, `image_entity`, `image`, `flip`, `hologram`, `reflection`, `invert`, `popup` |
| `inverter` | `image`, `flip`, `reflection`, `entity`, `popup` |

`popup` ist eine Liste von Entities, die beim Antippen eines Elements erscheinen:

```yaml
popup:
  - entity: sensor.battery_temperature
    name: Temperatur
  - switch.wallbox          # Schalter bekommen einen Kippschalter
```

Ein Klick auf eine Zeile öffnet den normalen HA-Detaildialog.

### Allgemein

| Option | Standard | Beschreibung |
|---|---|---|
| `style` | `real` | `real` (fotorealistisch) oder `tech` (Hologramm) |
| `language` | HA-Sprache | `de` oder `en` |
| `background` | – | eigenes Hintergrundbild (3:2), dann ggf. `layout` anpassen |
| `display.animation` | `comet` | `comet`, `dashes`, `dots` oder `none` |
| `display.speed` | `0.5` | Animationstempo |
| `display.unit` | `auto` | `auto` (ab 1000 W in kW), `W` oder `kW` |
| `display.decimals` | `2` | Nachkommastellen bei kW |
| `display.threshold` | `10` | unter diesem Wert (W) gilt ein Fluss als ruhend |
| `display.max_power` | `6000` | bei dieser Leistung (W) laufen die Flüsse am schnellsten |
| `display.show_inactive` | `true` | ruhende Leitungen schwach anzeigen |
| `display.font` | Systemschrift | z. B. `"Rajdhani, sans-serif"` |

### Farben

```yaml
colors:
  pv: "#0080ff"
  home: "#0080ff"
  battery_charge: "#00ffff"
  battery_discharge: "#00f9f9"
  grid_import: "#ff3333"
  grid_export: "#00ff00"
  car: "#00ffff"
  text: "#00f9f9"
  soc_on: "#00ffff"
  soc_off: "#5aa7c3"
  soc_low: "#ff4040"
```

## Eigene Bilder

### Auto aus MySkoda (oder einer anderen Auto-Integration)

```yaml
car:
  image_entity: image.skoda_superb_combi_hauptansicht_des_fahrzeugs
  flip: true        # falls das Auto in die falsche Richtung schaut
```

### Batterie und Wechselrichter (z. B. GoodWe Lynx und GoodWe ET)

1. Ein Foto suchen, am besten schräg von vorne links.
2. Den Hintergrund entfernen, z. B. in Windows 11 Paint mit „Hintergrund entfernen“, und als PNG speichern.
3. Die PNG-Datei nach `/config/www/energy-card/` legen. In HA heißt der Pfad dann `/local/energy-card/...`.

```yaml
battery:
  image: /local/energy-card/goodwe-lynx.png
inverter:
  image: /local/energy-card/goodwe-et.png
```

Herstellerfotos sind urheberrechtlich geschützt. Leg sie deshalb nur in dein
eigenes HA und nicht in ein öffentliches Repository.

Bei eigenen Batteriebildern ist der Segment-Balken aus. Über `battery.soc_face`
lässt er sich auf das neue Bild setzen (Anteile von Bildbreite und -höhe, siehe Code).

### Positionen anpassen

Alle Positionen sind Pixel auf dem 3072 × 2048 großen Hintergrundbild.
Jeder Wert aus `LAYOUT` im Code lässt sich überschreiben:

```yaml
layout:
  car: { x: 2330, y: 870, width: 720, height: 420 }
  inverter: { x: 1515, y: 830, width: 520, height: 590 }
  battery: { x: 937, y: 1075, width: 307 }
  boxes:
    car: [2811, 768]
  flows:
    car: [[1905, 1190], [2388, 1006], [2435, 1175]]
```

## Entwicklung

`dev/index.html` ist eine Testseite mit Schiebereglern für alle Werte:

```bash
python -m http.server 8000
```

Danach `http://localhost:8000/dev/` öffnen. Ein Raster für die Koordinaten lässt sich dort einschalten.

## Lizenz

Code: MIT, siehe [LICENSE](LICENSE).
Hintergrund- und Batteriebilder: aus dem Projekt Lumina Energy Card, nur
nicht-kommerzielle Nutzung, siehe [NOTICE-ASSETS.md](NOTICE-ASSETS.md).
