// Controller for the Time Machine game (Arduino Uno): a joystick, a 4x4 keypad, an IR remote, a buzzer and a 4-digit display.
//
// Joystick:  GND -> GND, +5V -> 5V, VRx -> A0, VRy -> A1, SW -> D2.
// Keypad (4x4, 8 pins in a row): hold it with the keys facing you and the pins at the bottom, then count the pins from the left:
//            pins 1,2,3,4 (the rows)    -> D4, D5, D6, D7
//            pins 5,6,7,8 (the columns) -> D9, D10, D11, D12
// Buzzer (optional): + side -> D8, other side -> GND. It plays a little tune for a coin, a landmark, a job, a win, a defeat and getting hurt.
// 4-digit display (optional, the kind with a small board and 4 pins, called TM1637): CLK -> A2, DIO -> A3, VCC -> 5V, GND -> GND.
//            Then change USE_DISPLAY to true below. It shows your denarii (up to 9999), and your health (H 87) for a moment when you are hurt.
// IR receiver (optional): its 3 pins are the signal, GND and power (check the labels on yours!): signal -> D3, GND -> GND, power -> 5V.
//            Then change USE_IR to true below. The remote's keys become game keys (see IR in controller.js): the digits set your walking speed.
//
// It prints one line about 50 times a second:  x,y,button,key,remote   (for example  -62,100,0,5,)
//   x: -100 (left) .. 100 (right)   y: -100 (back) .. 100 (forward)   button: 1 while the stick is pressed down (a jump)
//   key: the keypad key being pressed (0-9, A-D, * or #), or nothing        remote: the number of the remote key being held, or nothing
// The game sends back single letters for the buzzer (C coin, H hurt, L landmark, J job, W win, X defeat) and D1234 / P87 lines for the display.
// Open the Serial Monitor at 115200 baud to check the numbers. If left/right or forward/back feel the wrong way round, change FLIP_X or FLIP_Y.

const int PIN_X = A0, PIN_Y = A1, PIN_SW = 2, PIN_IR = 3, PIN_BUZZER = 8, PIN_CLK = A2, PIN_DIO = A3;
const bool FLIP_X = false, FLIP_Y = false;
const bool USE_DISPLAY = false, USE_IR = false;

const byte ROW_PINS[4] = {4, 5, 6, 7};
const byte COL_PINS[4] = {9, 10, 11, 12};
const char KEYS[4][4] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};

int cx = 512, cy = 512;                      // where the stick rests (measured at start-up)
char rawKey = 0, stableKey = 0;              // a key counts once it has been read the same way twice in a row (no bounce)

// ------------------------------------------------------------------ tunes (frequency in Hz, length in ms; 0 Hz is a rest; a length of 0 ends the tune)
struct Note { unsigned int f; unsigned int ms; };
const Note TUNE_COIN[]     = {{1568, 60}, {2093, 110}, {0, 0}};
const Note TUNE_HURT[]     = {{220, 220}, {0, 0}};
const Note TUNE_LANDMARK[] = {{523, 100}, {659, 100}, {784, 100}, {1047, 220}, {0, 0}};
const Note TUNE_JOB[]      = {{659, 90}, {880, 170}, {0, 0}};
const Note TUNE_WIN[]      = {{523, 110}, {523, 110}, {523, 110}, {659, 260}, {0, 60}, {523, 110}, {659, 110}, {784, 420}, {0, 0}};
const Note TUNE_LOSE[]     = {{392, 220}, {330, 220}, {262, 460}, {0, 0}};
const Note *tune = nullptr;
byte tuneAt = 0;
unsigned long tuneNext = 0;

void play(const Note *t) { tune = t; tuneAt = 0; tuneNext = 0; }

void tuneStep() {                            // a tune plays in the background, one note at a time
  if (!tune || millis() < tuneNext) return;
  Note n = tune[tuneAt];
  if (n.ms == 0) { tune = nullptr; return; }
  if (n.f) tone(PIN_BUZZER, n.f, n.ms); else noTone(PIN_BUZZER);
  tuneNext = millis() + n.ms + 20;
  tuneAt++;
}

// ------------------------------------------------------------------ the TM1637 4-digit display, driven by hand (no library needed)
const byte DIGIT_SEG[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
const byte SEG_H = 0x76;

void tmStart() { digitalWrite(PIN_DIO, HIGH); digitalWrite(PIN_CLK, HIGH); delayMicroseconds(5); digitalWrite(PIN_DIO, LOW); delayMicroseconds(5); digitalWrite(PIN_CLK, LOW); }
void tmStop() { digitalWrite(PIN_CLK, LOW); digitalWrite(PIN_DIO, LOW); delayMicroseconds(5); digitalWrite(PIN_CLK, HIGH); delayMicroseconds(5); digitalWrite(PIN_DIO, HIGH); delayMicroseconds(5); }
void tmByte(byte b) {
  for (byte i = 0; i < 8; i++) {
    digitalWrite(PIN_CLK, LOW);
    digitalWrite(PIN_DIO, (b >> i) & 1);
    delayMicroseconds(5);
    digitalWrite(PIN_CLK, HIGH);
    delayMicroseconds(5);
  }
  digitalWrite(PIN_CLK, LOW);                // the display answers with an acknowledge pulse
  pinMode(PIN_DIO, INPUT_PULLUP);
  delayMicroseconds(5);
  digitalWrite(PIN_CLK, HIGH);
  delayMicroseconds(5);
  digitalWrite(PIN_CLK, LOW);
  pinMode(PIN_DIO, OUTPUT);
}
void tmShow(const byte seg[4]) {
  tmStart(); tmByte(0x40); tmStop();         // write the digits one after the other
  tmStart(); tmByte(0xC0); for (byte i = 0; i < 4; i++) tmByte(seg[i]); tmStop();
  tmStart(); tmByte(0x88 | 4); tmStop();    // display on, medium brightness
}

long denarii = 0;
int health = 100;
unsigned long healthUntil = 0;               // while this is in the future the display shows your health instead of your denarii
bool displayDirty = true;

void refreshDisplay() {
  byte seg[4] = {0, 0, 0, 0};
  if (healthUntil && millis() < healthUntil) {
    seg[0] = SEG_H;
    int h = constrain(health, 0, 999);
    if (h >= 100) seg[1] = DIGIT_SEG[h / 100];
    if (h >= 10) seg[2] = DIGIT_SEG[(h / 10) % 10];
    seg[3] = DIGIT_SEG[h % 10];
  } else {
    long n = max(0L, denarii);
    bool over = n > 9999;
    if (over) n = 9999;                      // (more than 9999: shows 9999 with the colon lit)
    seg[3] = DIGIT_SEG[n % 10];
    if (n >= 10) seg[2] = DIGIT_SEG[(n / 10) % 10];
    if (n >= 100) seg[1] = DIGIT_SEG[(n / 100) % 10];
    if (n >= 1000) seg[0] = DIGIT_SEG[n / 1000];
    if (over) seg[1] |= 0x80;
  }
  tmShow(seg);
}

// ------------------------------------------------------------------ what the game sends us
char numKind = 0;
long numVal = 0;

void finishNumber() {
  if (numKind == 'D') { denarii = numVal; displayDirty = true; }
  else if (numKind == 'P') {
    if (numVal < health) healthUntil = millis() + 2500;   // hurt: show the health for a moment
    health = numVal; displayDirty = true;
  }
  numKind = 0;
}

void feed(char c) {
  if (numKind) {
    if (c >= '0' && c <= '9') { numVal = numVal * 10 + (c - '0'); return; }
    finishNumber();
  }
  switch (c) {
    case 'C': play(TUNE_COIN); break;
    case 'H': play(TUNE_HURT); break;
    case 'L': play(TUNE_LANDMARK); break;
    case 'J': play(TUNE_JOB); break;
    case 'W': play(TUNE_WIN); break;
    case 'X': play(TUNE_LOSE); break;
    case 'D': case 'P': numKind = c; numVal = 0; break;
  }
}

// ------------------------------------------------------------------ the IR remote (NEC): the receiver pulls its pin low for each burst of light
volatile unsigned long irLastEdge = 0;
volatile byte irCount = 0;
volatile unsigned int irGap[70];
int irCode = -1;                             // the remote key being held (its command number), or -1
unsigned long irHeldUntil = 0;

void irEdge() {                              // runs at every change of the pin and records how long the last state lasted
  unsigned long t = micros(), d = t - irLastEdge;
  irLastEdge = t;
  if (irCount < 70) irGap[irCount++] = d > 65000UL ? 65000U : (unsigned int)d;
}

void irRead() {
  noInterrupts();
  byte n = irCount;
  unsigned long last = irLastEdge;
  interrupts();
  if (n > 0 && micros() - last > 12000UL) {  // the message is over
    unsigned int g[70];
    noInterrupts();
    for (byte i = 0; i < n; i++) g[i] = irGap[i];
    irCount = 0;
    interrupts();
    if (n >= 3 && g[1] > 8000 && g[1] < 10000) {
      if (n >= 67 && g[2] > 4000 && g[2] < 5000) {          // a full message: 32 bits, the 3rd byte is the key
        unsigned long code = 0;
        for (byte i = 0; i < 32; i++) if (g[4 + 2 * i] > 1100) code |= 1UL << i;
        byte cmd = (code >> 16) & 0xFF, inv = (code >> 24) & 0xFF;
        if (cmd == (byte)~inv) { irCode = cmd; irHeldUntil = millis() + 220; }
      } else if (g[2] > 1800 && g[2] < 2700 && irCode >= 0) {   // "still holding": the repeat message
        irHeldUntil = millis() + 220;
      }
    }
  }
  if (irCode >= 0 && millis() > irHeldUntil) irCode = -1;
}

// ------------------------------------------------------------------ the rest
void setup() {
  Serial.begin(115200);
  pinMode(PIN_SW, INPUT_PULLUP);             // pressed = LOW
  pinMode(PIN_BUZZER, OUTPUT);
  for (byte c = 0; c < 4; c++) pinMode(COL_PINS[c], INPUT_PULLUP);
  for (byte r = 0; r < 4; r++) pinMode(ROW_PINS[r], INPUT);
  if (USE_DISPLAY) { pinMode(PIN_CLK, OUTPUT); pinMode(PIN_DIO, OUTPUT); refreshDisplay(); }
  if (USE_IR) { pinMode(PIN_IR, INPUT); attachInterrupt(digitalPinToInterrupt(PIN_IR), irEdge, CHANGE); }
  delay(300);
  cx = analogRead(PIN_X);                    // do not touch the stick while it starts
  cy = analogRead(PIN_Y);
}

int axis(int raw, int center) {
  int v = raw - center;
  if (abs(v) < 40) return 0;                 // dead zone, so a resting stick does not drift
  int span = v < 0 ? center : 1023 - center;
  return constrain((long)v * 100 / span, -100, 100);
}

// Pull one row at a time low and see which column goes low with it.
char scanKeypad() {
  char found = 0;
  for (byte r = 0; r < 4 && !found; r++) {
    pinMode(ROW_PINS[r], OUTPUT);
    digitalWrite(ROW_PINS[r], LOW);
    delayMicroseconds(20);
    for (byte c = 0; c < 4; c++) if (digitalRead(COL_PINS[c]) == LOW) { found = KEYS[r][c]; break; }
    pinMode(ROW_PINS[r], INPUT);
  }
  return found;
}

void loop() {
  int x = axis(analogRead(PIN_X), cx);
  int y = -axis(analogRead(PIN_Y), cy);      // pushing the stick up gives a bigger y
  if (FLIP_X) x = -x;
  if (FLIP_Y) y = -y;

  char k = scanKeypad();
  if (k == rawKey) stableKey = k;
  rawKey = k;

  if (USE_IR) irRead();

  Serial.print(x); Serial.print(','); Serial.print(y); Serial.print(',');
  Serial.print(digitalRead(PIN_SW) == LOW ? 1 : 0); Serial.print(',');
  if (stableKey) Serial.print(stableKey);
  Serial.print(',');
  if (irCode >= 0) Serial.print(irCode);
  Serial.println();

  while (Serial.available()) feed(Serial.read());
  tuneStep();
  if (USE_DISPLAY) {
    if (healthUntil && millis() >= healthUntil) { healthUntil = 0; displayDirty = true; }
    if (displayDirty) { displayDirty = false; refreshDisplay(); }
  }
  delay(20);
}
