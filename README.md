# Energy Card

Eine Home-Assistant-Karte mit animierten Energieflüssen über einer 3D-Szene:
PV-Anlage, Batterie, Haus, Netz, Wechselrichter und Auto.

- Animierte Flüsse (Komet, Striche oder Punkte), die im rechten Winkel über den Boden laufen; Tempo passt sich der Leistung an
- Werte-Boxen mit Tagesertrag, Netzbezug und -einspeisung; sie bleiben auch auf dem Handy in der Karte
- Batterie-Ladestand als leuchtender 6-Segment-Balken
- Popups mit beliebigen Sensoren; Schalter und Lichter lassen sich direkt schalten
- Auto-Bild direkt aus einem HA-Bild-Entity (z. B. MySkoda), mit Spiegelung auf dem Boden
- Ladekabel am Auto: steckt, sobald das Auto angeschlossen ist, und leuchtet beim Laden. Der Energiefluss läuft bis in die Ladebuchse.
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
| `battery` | `soc`, `power`, `invert`, `name`, `popup`, `image`, `trim`, `ports`, `leds`, `led_count`, `soc_bar` (`false` = aus), `soc_face` |
| `home` | `entity`, `name`, `popup` |
| `grid` | `entity`, `invert`, `daily_import`, `daily_export`, `name`, `popup` |
| `car` | `power`, `soc`, `status`, `plug`, `name`, `image_entity`, `image`, `flip`, `trim`, `hologram`, `reflection`, `charge_port`, `cable`, `invert`, `popup` |
| `inverter` | `image`, `flip`, `trim`, `reflection`, `entity`, `popup` |

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
| `display.labels` | `false` | Überschriften wie „SOLAR“ über den Werten anzeigen |
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

Durchsichtige Ränder im Bild schneidet die Karte automatisch ab. Das Auto füllt
dann genau die Fläche `layout.car`, mit den Rädern auf der Unterkante.
Mit `trim: false` lässt sich das abschalten.

Die Spiegelung auf dem Boden richtet sich nach der Unterkante des Bildes: Die Karte sucht die
Linien, auf denen das Auto steht (vorne die Stoßstange, seitlich die Reifen), und spiegelt jede
Hälfte an ihrer Linie. So berühren sich Reifen und Spiegelbild auch bei Bildern von schräg oben.

### Auto von oben (eigenes Bild)

Die Bilder aus MySkoda und ähnlichen Apps sind auf Augenhöhe aufgenommen, die Szene aber von
schräg oben. Besser passt ein eigenes Bild, z. B. von einer Bild-KI erstellt: das Auto aus der
App als Vorlage, Blick etwa 30° von oben, die Front zeigt nach links unten, Front und rechte
Seite sind zu sehen, durchsichtiger Hintergrund ohne Boden, Schatten und Spiegelung.
Das Bild nach `/config/www/energy-card/` legen und statt `image_entity` angeben:

```yaml
car:
  image: /local/energy-card/superb.png
  charge_port: [0.205, 0.71]
```

### Ladekabel

```yaml
car:
  power: sensor.wallbox_power
  plug: binary_sensor.skoda_superb_combi_ladekabel   # optional: Kabel steckt
  charge_port: [0.22, 0.52]                           # Lage der Ladebuchse im Bild
```

Beim Laden hängt ein leuchtendes Kabel von der Ladebuchse auf den Boden, und der
Energiefluss läuft durch das Kabel bis ins Auto. Mit `plug` steckt das Kabel auch,
wenn das Auto angeschlossen ist, aber gerade nicht lädt. Dann leuchtet es nur schwach.

`charge_port` gibt an, wo die Buchse sitzt, so wie das Auto in der Karte steht (also nach
`flip`): Anteil der Breite von links und der Höhe von oben, gemessen am sichtbaren Auto.
`[0.5, 0.5]` wäre die Mitte des Autos. Der Standard passt zum gespiegelten MySkoda-Bild des
Superb iV, dessen Buchse rechts im Kühlergrill sitzt. `cable: false` schaltet das Kabel ab.

### Batterie und Wechselrichter (z. B. GoodWe Lynx D und GoodWe ET)

1. Ein Bild suchen, am besten schräg von vorne. Die Batterie steht links in der Szene,
   von dort sieht man ihre rechte Seite. Beim Wechselrichter passt die linke Seite.
2. Falls nötig den Hintergrund entfernen, z. B. in Windows 11 Paint mit „Hintergrund entfernen“, und als PNG speichern.
3. Die PNG-Datei nach `/config/www/energy-card/` legen. In HA heißt der Pfad dann `/local/energy-card/...`.

```yaml
battery:
  image: /local/energy-card/goodwe-lynx-d-2.png
inverter:
  image: /local/energy-card/goodwe-gw20k-et.png
```

Am besten passen Bilder, die wie die Szene von schräg oben aufgenommen sind (Front nach
links unten, rechte Seite und Oberseite sichtbar). Solche Bilder lassen sich mit einer Bild-KI
aus den Herstellerfotos erstellen, genauso wie beim Auto.

Mit einem eigenen Wechselrichter-Bild nimmt die Karte automatisch einen Hintergrund
ohne den Glas-Kasten, und die Leitungen enden am neuen Bild.
Position und Größe: `layout.inverter` und `layout.battery_image`.
Hohe Batterie-Stapel (z. B. 4 Module) wachsen nach oben, ohne schmaler zu werden.

Herstellerfotos sind urheberrechtlich geschützt. Leg sie deshalb nur in dein
eigenes HA und nicht in ein öffentliches Repository.

#### Leitung in jedes Modul

```yaml
battery:
  image: /local/energy-card/batterie.png
  ports: [[0.907, 0.183], [0.907, 0.432], [0.907, 0.682], [0.907, 0.909]]
```

`ports` sind die Anschlüsse am Batteriebild, z. B. einer pro Modul: Anteil der Breite von links
und der Höhe von oben, gemessen am sichtbaren Bild. Die Leitung kommt dann vom Wechselrichter in
den obersten Anschluss und läuft an der Seite durch alle anderen. Jeder Anschluss leuchtet und hat
sein eigenes Licht: beim Laden teilt sich der Fluss auf die Module auf, beim Entladen sammelt er
sich. Der Weg vom obersten Anschluss zum Wechselrichter steht in `layout.flows.battery_ports`.

#### Ladestand-LEDs am Modul

```yaml
battery:
  leds: [[0.389, 0.165, 0.488, 0.170], [0.389, 0.417, 0.488, 0.422], [0.389, 0.659, 0.487, 0.666], [0.389, 0.873, 0.487, 0.880]]
  led_count: 5   # Standard
```

`leds` ist je Modul eine LED-Reihe auf dem Bild: Anfang und Ende als Anteil von Breite und Höhe
(`[u0, v0, u1, v1]`). Die LEDs leuchten stufenweise nach Ladestand, bei 5 LEDs je 20 %. Beim Laden
blinkt die nächste. Auf einer normal großen Karte sind die LEDs sehr klein und wirken eher als
grüner Leuchtstreifen; einzeln erkennt man sie auf großen Bildschirmen.

Bei eigenen Batteriebildern ist der Segment-Balken aus. Über `battery.soc_face`
lässt er sich auf das neue Bild setzen (Anteile von Bildbreite und -höhe, siehe Code).

### Positionen anpassen

Alle Positionen sind Pixel auf dem 3072 × 2048 großen Hintergrundbild.
Jeder Wert aus `LAYOUT` im Code lässt sich überschreiben:

```yaml
layout:
  car: { x: 2290, y: 850, width: 760, height: 470 }
  inverter: { x: 1650, y: 1100, width: 230, height: 300 }   # nur mit inverter.image
  battery: { x: 937, y: 1075, width: 307 }
  battery_image: { x: 960, y: 1191, width: 280, height: 560 } # nur mit battery.image
  boxes:
    car: [2811, 768]
  flows:
    car: [[1853, 1374], [2126, 1477], [2420, 1345]]          # das Ladekabel beginnt am letzten Punkt
```

Die Flüsse sind Linienzüge aus beliebig vielen Punkten. Damit sie auf dem Boden liegen,
läuft jedes Teilstück entweder parallel zur rechten oder zur linken vorderen Kante der
Plattform. Wo die Richtung wechselt, entsteht so ein rechter Winkel.

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
