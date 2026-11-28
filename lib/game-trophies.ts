import { supabase } from "@/lib/supabase";
import type { GameTrophy, Player, Room } from "@/lib/types";

type Vote = { player_id: string; round: number; answer: string };
const make = (id: string, title: string, playerId: string, description: string): GameTrophy => ({ id, title, playerId, description });

export async function calculateGameTrophies(room: Room, players: Player[], mode: "spicy" | "party"): Promise<GameTrophy[]> {
  const { data, error } = await supabase.from(mode === "spicy" ? "spicy_answers" : "party_answers")
    .select("player_id, round, answer").eq("room_id", room.id);
  if (error) throw new Error(error.message);
  const votes = (data || []) as Vote[];
  const byRound = new Map<number, Vote[]>();
  for (const vote of votes) byRound.set(vote.round, [...(byRound.get(vote.round) || []), vote]);
  const majority = new Map<string, number>();
  const minority = new Map<string, number>();
  const exposure = new Map<string, number>();
  const first = new Map<string, number>();
  const rankSum = new Map<string, number>();
  const rankCount = new Map<string, number>();
  let binaryRounds = 0;
  let choiceRounds = 0;
  let rankingRounds = 0;
  const idsByName = new Map(players.map(p => [p.name, p.id]));
  // Only data belonging to this game session should be present; previous answers
  // are cleared when a new game starts or ends.
  for (const [round, rows] of byRound) {
    const { data: question, error: qError } = await supabase.from("game_trophy_rounds")
      .select("question_type, option_one, option_two").eq("room_id", room.id).eq("round", round).maybeSingle();
    if (qError) throw new Error(qError.message);
    if (!question) continue;
    if (question.question_type === "most_likely") {
      rankingRounds++;
      for (const row of rows) {
        let order: unknown;
        try { order = JSON.parse(row.answer); } catch { continue; }
        if (!Array.isArray(order)) continue;
        order.forEach((id, index) => {
          if (typeof id !== "string" || !players.some(p => p.id === id)) return;
          if (index === 0) first.set(id, (first.get(id) || 0) + 1);
          rankSum.set(id, (rankSum.get(id) || 0) + index + 1);
          rankCount.set(id, (rankCount.get(id) || 0) + 1);
        });
      }
      continue;
    }
    const binary = ["yes_no", "player_choice", "would_you_rather", "never_have_i_ever"].includes(question.question_type);
    if (!binary) continue;
    const a = rows.filter(r => r.answer === question.option_one);
    const b = rows.filter(r => r.answer === question.option_two);
    if (question.question_type === "player_choice") {
      choiceRounds++;
      for (const row of rows) {
        const id = idsByName.get(row.answer);
        if (id) exposure.set(id, (exposure.get(id) || 0) + 1);
      }
    }
    if (a.length === b.length || a.length + b.length < 2) continue;
    binaryRounds++;
    for (const row of a.length > b.length ? a : b) majority.set(row.player_id, (majority.get(row.player_id) || 0) + 1);
    for (const row of a.length < b.length ? a : b) minority.set(row.player_id, (minority.get(row.player_id) || 0) + 1);

  }
  const highest = (scores: Map<string, number>) => [...players].sort((a,b) => (scores.get(b.id)||0)-(scores.get(a.id)||0) || a.name.localeCompare(b.name))[0];
  const lowestAverage = [...players].filter(p => rankCount.has(p.id)).sort((a,b) =>
    (rankSum.get(b.id)! / rankCount.get(b.id)!) - (rankSum.get(a.id)! / rankCount.get(a.id)!) || a.name.localeCompare(b.name))[0];
  const wolf = highest(minority);
  const pleaser = highest(majority);
  const exposed = highest(exposure);
  const main = highest(first);
  const fallback = (id: string, title: string, scores: Map<string, number>) => {
    const winner = highest(scores) || players[0];
    return make(id, title, winner.id, `${scores.get(winner.id) || 0} votes`);
  };
  if (mode === "spicy") return [
    make("lone_wolf", "Lone Wolf", wolf.id, `${minority.get(wolf.id) || 0} minority votes`),
    make("people_pleaser", "People Pleaser", pleaser.id, `${majority.get(pleaser.id) || 0} majority votes`),
    choiceRounds ? make("most_exposed", "Talk of the Town", exposed.id, `${exposure.get(exposed.id) || 0} votes received`) : fallback("wild_card", "Wild Card", minority),
  ];
  return [
    choiceRounds ? make("most_exposed", "Talk of the Town", exposed.id, `${exposure.get(exposed.id) || 0} votes received`) : fallback("lone_wolf", "Lone Wolf", minority),
    rankingRounds && lowestAverage ? make("under_the_radar", "Under the Radar", lowestAverage.id, `Avg. rank #${(rankSum.get(lowestAverage.id)! / rankCount.get(lowestAverage.id)!).toFixed(1)}`) : fallback("people_pleaser", "People Pleaser", majority),
    rankingRounds ? make("main_character", "Main Character", main.id, `${first.get(main.id) || 0} first-place votes`) : fallback("most_exposed_alt", "Talk of the Town", exposure),
  ];
}
