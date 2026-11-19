// Dialogue: Vera's briefings, pedestrian greetings, debriefs, radio banter.
export const VERA_LINES = {
  hello: 'Vera wipes a glass. "Back for work? The bay does not pay the lazy."',
  r1: '"Easy one. Drive the taxi, pick up my friend at the pier. Do not scratch the paint."',
  r2: '"A parcel, Coral Row, ninety seconds. The clock is not your friend."',
  r3: '"Follow the courier. Close enough to see, far enough to vanish. Focus helps."',
  r4: '"That Coral Coupe by the dealer? It is ours now. Bring it to the docks."',
  r5: '"The crew is inside the casino. Get them out and lose the blue lights."',
  r6: '"A smuggler boat is running the causeway. Chase it down, love."',
  i1: '"Photograph the vault door. Smile for the cameras — no, do not smile."',
  i2: '"Case Bay Mart. Back door, cameras, safe. Then we talk."',
  i3: '"Three drop-offs, three markers. Do not stop for coffee."',
  i4: '"Draw the police away from Coral Row. Be the loudest thing on the road."',
  i5: '"Gull and Gun has cameras. Make them blink."',
  i6: '"Ryan is in a cordon at the docks. Go get your man."',
  finale: '"The vault, the boat, the road. Both of you, together. This is the one."',
};
export const DEBRIEFS = {
  r1: 'Vera: "Clean driving. The bay is starting to notice you."',
  r2: 'Vera: "On time. I like a hustler who respects a clock."',
  r3: 'Vera: "Unseen. That is a skill money cannot buy."',
  r4: 'Vera: "The coupe is ours. The dealer will cry into his ledger."',
  r5: 'Vera: "The crew is safe and the police are confused. Beautiful."',
  r6: 'Vera: "The smuggler swims home. The bay is ours tonight."',
  i1: 'Vera: "Good angles. The vault has a weak hinge, left side."',
  i2: 'Vera: "Back door, two cameras, one sleepy guard. Noted."',
  i3: 'Vera: "Three drops, no fuss. You are a ghost with good shoes."',
  i4: 'Vera: "Every patrol in the city followed you. Perfect decoy."',
  i5: 'Vera: "Cameras dark. The shop is blind now."',
  i6: 'Vera: "You got him out. That is what partners do."',
  finale: 'Vera: "The vault is empty and the bay is rich. You two did it."',
};
export const PED_GREETINGS = [
  '"Nice day on the bay."',
  '"You look like trouble. Good trouble, I hope."',
  '"The ferry is late again. It is always late."',
  '"Have you tried the fish at the pier? Best in the city."',
  '"My cousin saw a gator in the mangroves. A big one."',
  '"Sunset from Gull Point tonight. Do not miss it."',
  '"The casino took my last paycheck. Yours too?"',
  '"I hear Vera is hiring. Ask at the Anchor."',
];
export const PED_FLEE_LINES = [
  '"Help! Somebody call the police!"',
  '"I am calling the police right now!"',
  '"Stay away from me!"',
];
export const RADIO_BANTER = [
  'DJ Bay: "That was the tide, rolling in. Up next, a song about a stolen coupe."',
  'Talk host: "Caller, you cannot outrun a helicopter on a bicycle. Next."',
  'Podcast host: "The old lighthouse keeper swears the light blinks in code."',
];
export function veraLine(id) { return VERA_LINES[id] || VERA_LINES.hello; }
export function debrief(id) { return DEBRIEFS[id] || 'Vera: "Well done. Next job when you are ready."'; }
export function randomGreeting() { return PED_GREETINGS[Math.floor(Math.random() * PED_GREETINGS.length)]; }
export function randomFlee() { return PED_FLEE_LINES[Math.floor(Math.random() * PED_FLEE_LINES.length)]; }
