# https://github.com/viktorexe/terristats-discord-bot
def get_points(win):
    """Calculate points for a win. Contest wins count as double."""
    base_points = win.get('player_count', 0)
    if win.get('contest', False):
        return base_points * 2
    return base_points

def calculate_total_points(wins):
    """Calculate total points from a list of wins."""
    return sum(get_points(w) for w in wins)
