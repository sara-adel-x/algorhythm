"""Scene metadata, hand-authored.

Every factual sentence here is either lifted from the NASA description of the
image (kind: "nasa") or describes something visible in the frame (kind:
"image"). Nothing is inferred and presented as fact.
"""
import json
from pathlib import Path

OUT = Path("pipeline/meta")
OUT.mkdir(parents=True, exist_ok=True)

SCENES = {
    "m74": {
        "id": "m74",
        "title": "M74 — The Phantom Galaxy",
        "subtitle": "Spiral galaxy in Pisces, 30 million light-years away",
        "eyebrow": "Spitzer Space Telescope · infrared",
        "source": {
            "agency": "NASA/JPL-Caltech/STScI",
            "id": "PIA08533",
            "date": "2006-06-09",
            "url": "https://images.nasa.gov/details/PIA08533",
        },
        "sound": {
            "root": "D",
            "scale": "lydian",
            "lead": ["warm", "hollow", "glass", "shimmer"],
            "drone": "deepPad",
            "reverbDecay": 7,
        },
        "facts": "M74 is a grand-design spiral galaxy seen almost face-on. Spitzer's infrared eye sees the dust that glows between the stars, which is why the arms read as ribbons rather than as points of light.",
        "journeyIntro": "Let's start with a galaxy. Put your finger on the picture, or use the arrow keys. The middle is bright. The edges are nearly empty. Listen for the difference.",
        "hotspots": [
            {
                "x": 0.50, "y": 0.48, "name": "The galactic core", "kind": "nasa",
                "text": "The centre, where the stars are packed so tightly that the whole middle glows white. Here the sound is high and full, because the picture is at its brightest.",
            },
            {
                "x": 0.72, "y": 0.29, "name": "The upper arm", "kind": "image",
                "text": "A spiral arm, lit up in pink. This is an infrared picture, so what glows here is warm dust, not starlight — the galaxy's own smoke, heated from inside.",
            },
            {
                "x": 0.34, "y": 0.69, "name": "The lower arm", "kind": "image",
                "text": "The other arm, thinner and cooler. Notice how the sound thins out as the dust fades — the pitch stays, but the brightness drains away.",
            },
            {
                "x": 0.73, "y": 0.68, "name": "The dust factory", "kind": "nasa",
                "text": "A dark lane of cold dust. In infrared it is almost silent here, and that silence is information: this is where new stars are being built, hidden from ordinary light.",
            },
        ],
        "journey": ["The galactic core", "The upper arm", "The lower arm", "The dust factory"],
    },

    "pillars": {
        "id": "pillars",
        "title": "Pillars of Creation",
        "subtitle": "The Eagle Nebula, 6,500 light-years away",
        "eyebrow": "Hubble Space Telescope · near-infrared",
        "source": {
            "agency": "NASA/ESA/Hubble Heritage Team (STScI/AURA)",
            "id": "GSFC_20171208_Archive_e000842",
            "date": "2014-01-06",
            "url": "https://images.nasa.gov/details/GSFC_20171208_Archive_e000842",
        },
        "sound": {
            "root": "F",
            "scale": "majorPentatonic",
            "lead": ["hollow", "glass", "shimmer", "warm"],
            "drone": "choir",
            "reverbDecay": 9,
        },
        "facts": "This is Hubble's near-infrared view of the Eagle Nebula. Infrared light passes through much of the gas and dust, so the pillars become wispy silhouettes against a sky full of stars that were hidden before.",
        "journeyIntro": "These are towers of gas and dust, light-years tall. Stars are being born inside them. Move slowly here — the sound is meant to be a choir, not a machine.",
        "hotspots": [
            {
                "x": 0.38, "y": 0.30, "name": "The tallest pillar", "kind": "image",
                "text": "The leftmost tower. It is a column of cold hydrogen, and at its tip the gas is collapsing into new stars. The sound is open and airy at the top and darker where the dust is thick.",
            },
            {
                "x": 0.62, "y": 0.36, "name": "The middle tower", "kind": "image",
                "text": "The central column, edged in light. That bright rim is gas being evaporated by the radiation of nearby young stars — the pillars are being slowly eaten away.",
            },
            {
                "x": 0.88, "y": 0.60, "name": "The star field", "kind": "nasa",
                "text": "In near-infrared the background is crowded with stars that the visible-light picture cannot see. Each tiny point is a sun. The sound here is a scatter of small bright accents.",
            },
            {
                "x": 0.24, "y": 0.55, "name": "The blue haze", "kind": "image",
                "text": "A blue veil of scattered starlight between the towers. It is not fog and it is not smoke — it is light from thousands of stars, spread thin. The sound is soft and wide here, with almost no edge to it.",
            },
        ],
        "journey": ["The tallest pillar", "The middle tower", "The blue haze", "The star field"],
    },

    "irma": {
        "id": "irma",
        "title": "Hurricane Irma",
        "subtitle": "Category 5, Atlantic Ocean, 6 September 2017",
        "eyebrow": "MODIS / Terra · true colour",
        "source": {
            "agency": "NASA Worldview / GIBS · MODIS Terra",
            "id": "MODIS_Terra_CorrectedReflectance_TrueColor",
            "date": "2017-09-06",
            "url": "https://worldview.earthdata.nasa.gov/?v=-72,13,-50,26&t=2017-09-06",
        },
        "sound": {
            "root": "A",
            "scale": "dorian",
            "lead": ["warm", "hollow", "glass", "shimmer"],
            "drone": "wind",
            "reverbDecay": 5,
            "noise": { "level": 0.05, "cutoff": 900 },
        },
        "facts": "Irma was the strongest hurricane ever recorded in the open Atlantic, outside the Caribbean Sea and the Gulf of Mexico. This is what Terra's MODIS instrument saw at midday on 5 September 2017, as the storm moved west toward the islands.",
        "journeyIntro": "This is a hurricane the size of a country. There is a still point in the middle and a wall of weather all around it. Follow the sound out from the centre.",
        "hotspots": [
            {
                "x": 0.29, "y": 0.58, "name": "The eye", "kind": "image",
                "text": "The eye. A hole in the storm, thirty kilometres across, where the sky is clear and the wind drops. In the sound it is the one calm, bright point in the middle of everything.",
            },
            {
                "x": 0.235, "y": 0.50, "name": "The eyewall", "kind": "nasa",
                "text": "The eyewall: the ring of tallest, fastest cloud, circling the eye. This is where the storm is strongest. The picture is at its whitest here, so the sound is at its fullest.",
            },
            {
                "x": 0.68, "y": 0.42, "name": "The spiral bands", "kind": "image",
                "text": "Rain bands trailing out to the east, hundreds of kilometres long. They look soft, but each one is a line of thunderstorms. Listen to how the texture breaks up as you cross them.",
            },
            {
                "x": 0.45, "y": 0.88, "name": "The feeder band", "kind": "image",
                "text": "A feeder band dragging tropical moisture northward into the storm. The ocean underneath is the fuel. Warm water, evaporating, is the whole engine.",
            },
        ],
        "journey": ["The eye", "The eyewall", "The spiral bands", "The feeder band"],
    },

    "night": {
        "id": "night",
        "title": "Earth at Night",
        "subtitle": "City lights, as seen from orbit",
        "eyebrow": "VIIRS · Black Marble",
        "source": {
            "agency": "NASA Earth Observatory · VIIRS Black Marble",
            "id": "VIIRS_Black_Marble",
            "date": "2012-2016 composite",
            "url": "https://earthobservatory.nasa.gov/features/NightLights",
        },
        "sound": {
            "root": "C",
            "scale": "mixolydian",
            "lead": ["glass", "shimmer", "hollow", "warm"],
            "drone": "deepPad",
            "reverbDecay": 6,
        },
        "facts": "The Black Marble is a composite of cloud-free night images from the VIIRS instrument on the Suomi NPP satellite. What you are hearing is not a photograph of cities — it is a map of how much light reaches orbit from the ground.",
        "journeyIntro": "This is our planet with the sun taken away. Every bright speck is somebody's street. Move across it and the sound will tell you where people are and where the dark is.",
        "hotspots": [
            {
                "x": 0.255, "y": 0.325, "name": "The American east coast", "kind": "image",
                "text": "The east coast of North America, drawn in light. The dense chain from Boston to Washington is one of the brightest continuous lines on the planet.",
            },
            {
                "x": 0.55, "y": 0.22, "name": "Europe", "kind": "image",
                "text": "Western Europe, almost solid with light. The dark gaps are mountains and sea — the Alps, the North Sea, the Bay of Biscay.",
            },
            {
                "x": 0.60, "y": 0.42, "name": "The Nile", "kind": "nasa",
                "text": "A thin bright thread through the dark: the Nile, and the farms along it. Everything on either side is desert, and in this picture the desert is genuinely black.",
            },
            {
                "x": 0.73, "y": 0.44, "name": "India", "kind": "image",
                "text": "India, lit village by village. This is one of the best places on Earth to hear the difference between a city and a field: the pitch barely changes, but the brightness does.",
            },
        ],
        "journey": ["The American east coast", "Europe", "The Nile", "India"],
    },

    "amazon": {
        "id": "amazon",
        "title": "Mato Grosso, Brazil",
        "subtitle": "The same patch of Amazon, before and after clearing",
        "eyebrow": "Terra / ASTER · visible and near-infrared",
        "source": {
            "agency": "NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team",
            "id": "PIA11420",
            "date": "2008-10-16",
            "url": "https://images.nasa.gov/details/PIA11420",
        },
        "sound": {
            "root": "G",
            "scale": "pentatonic",
            "lead": ["hollow", "warm", "glass", "shimmer"],
            "drone": "organic",
            "reverbDecay": 6,
            "noise": { "level": 0.03, "cutoff": 1400 },
        },
        "facts": "Dense green vegetation gives way to pale fields in these satellite images of deforestation in the Brazilian Amazon, taken by NASA's Terra satellite. The river is the same river in both frames — that is how you know it is the same place.",
        "journeyIntro": "Two pictures of the same river. In the first, the land around it is closed forest. In the second, it has been cut into fields. Press T to hear the change happen.",
        "hotspots": [
            {
                "x": 0.55, "y": 0.50, "name": "The river", "kind": "image",
                "text": "The same river bends through both pictures. In the forest it runs white with sediment; in the cleared land it is blue and straight-edged, because the shade has gone.",
            },
            {
                "x": 0.25, "y": 0.25, "name": "Closed forest", "kind": "image",
                "text": "Closed canopy. Every pixel here is leaves, and the sound is dense and even, with almost no edges — a forest has very little visual contrast.",
            },
            {
                "x": 0.78, "y": 0.72, "name": "The fields", "kind": "nasa",
                "text": "Pale rectangles of pasture and soy. The edges are what you hear: each field boundary is a bright line, and each one puts a small accent into the music.",
            },
        ],
        "journey": ["The river", "Closed forest", "The fields"],
        "timeMachine": {
            "from": "amazon-then",
            "to": "amazon-now",
            "labels": ["Forest", "Fields"],
            "caption": "Terra / ASTER, the same coordinates. The left frame is closed forest; the right is the same land after clearing.",
        },
    },
}

for key, scene in SCENES.items():
    (OUT / f"{key}.json").write_text(json.dumps(scene, indent=2, ensure_ascii=False) + "\n")
    print("wrote", key)
