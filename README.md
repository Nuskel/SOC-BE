# SOC-BE

## Funktion der Anwendung

Die Anwendung besteht aus Service, MDC-Controller und dem Telnet-Client.

Anfragen werden über folgenden Endpunkt erwartet: `https://{ip}:9001/api/v1/{scope}`

Folgende Scopes sind bekannt:

* `config`: Ohne weitere Angabe eines Pfades kann über den `?{option}` Parameter bestimmt werden, welcher Konfigurationsabschnitt exportiert wird.
* `videowall`: Zur Steuerung der Videowand.
  * Erwartet keine weitere URL-Angaben.
  * Body-Format: `device,device;device,device`
    * Pro `,` wird ein Monitor in einer Zeile als Teil der Videowand angegeben
    * Pro `;` wird eine neue Zeile aufgemacht
  * Beispiel: 4 Monitore als 2x2 Videowand
    * | x | x |   |
      |---|---|---|
      | x | x |   |
    * `soc-mon01,soc-mon02;soc-mon04,soc-mon05`
* `device`: Leitet Befehle an die Endgeräte weiter.

## Aufbau der Konfiguration

Siehe `config.json`

### Geräte `devices`

Desktops werden mit dem Typ `client` versehen und haben folgende Felder:

* `type`*: Identifiziert das Device und dessen Handlerlogik.
* `name`: Kann durch die Rückgabe der Config das FE unterstützen.
* `index`*: Stellt den Input-Index für den SWITCH dar.

Für den Typ `ext-client` muss folgendes Feld mit angegeben werden:

* `source`*: Alternative zu einem Switch-Binding. Der Anschluss erfolgt immer über die Quelle.

---

Monitore werden über den Typ `monitor` angegeben und benötigen folgende Felder:

* `type`*: Identifiziert das Device und dessen Handlerlogik.
* `name`: Kann durch die Rückgabe der Config das FE unterstützen.
* `index`*: Stellt den Output-Index für den SWITCH dar.
* `ip`*: IP des Monitors.
* `id`*: ID des Monitors (MDC intern).
* `main-source`*: Quelle, an dem der Switch den Monitor ansteuert.

---

Der ATEN-Switch wird über den Typ `switch` wiefolgt definiert:

* `type`*: Identifiziert das Device und dessen Handlerlogik.
* `name`: Kann durch die Rückgabe der Config das FE unterstützen.
* `ip`*: IP des Switches für Telnet.
* `matrix`: Stellt den Output-Index für den SWITCH dar.

`*` - verpflichtende Felder

### Befehle `commands`

Befehle werden zu je einem Device-Typ gruppiert. D. h., dass jedes Device eine bestimmte Menge an Befehlen definiert und diese über einen Namen zu der technischen Bezeichnung übersetzt. Zudem können diverse Parameter mit angegeben werden.

Befehle der Monitore:

* `power`: Schaltet einen Bildschirm ein oder aus.
* `videowall_toggle`: Schaltet den Videowandmodus eines Monitors ein oder aus.
* `videowall_set`: Setzt die Verteilung der Videowand.
* `source`: Setzt die Eingangsquelle des Monitors.

Befehle des Switches:

* `state`: Gibt eine Verbindungsmatrix aller Eingänge und Ausgänge wieder.
* `bind`: Verbindet eine Ausgabe mit einer Eingabe.

Jeder Befehl muss das Feld `id` angeben, welches für das jeweilige Endgerät die teschnische bezeichnung liefert.
