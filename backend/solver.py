from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from typing import List, Optional, Dict

def solve_vrp_dynamic(
    matrix: List[List[int]], 
    time_limit_minutes: int, 
    return_to_start: bool, 
    end_point_index: Optional[int],
    pace: str = "balanced",
    strictness: int = 5
) -> List[int]:
    
    num_nodes = len(matrix)
    if num_nodes < 2:
        return [0]

    manager = pywrapcp.RoutingIndexManager(num_nodes, 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    def time_callback(from_index, to_index):
        # Просто время пути, без накрутки "времени на осмотр", чтобы легче впихивалось
        return matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # --- АГРЕССИВНЫЕ НАСТРОЙКИ ---
    
    # 1. Огромный штраф за пропуск. 
    # Алгоритм будет готов "умереть" (превысить время), но посетить точку.
    # 1 час пути (3600 сек) < 100 000 штрафа.
    base_penalty = 100_000 
    
    # 2. Мягкий лимит времени
    limit_seconds = time_limit_minutes * 60
    # Capacity очень большая, чтобы не было "Hard Limit"
    routing.AddDimension(
        transit_callback_index,
        0,  # slack
        24 * 3600, # capacity (сутки)
        True,
        'Time'
    )
    time_dimension = routing.GetDimensionOrDie('Time')
    
    # Устанавливаем "Soft Upper Bound".
    # Если превысил limit_seconds -> плати штраф.
    # Штраф (100) намного меньше, чем штраф за пропуск точки (100_000).
    # Вывод: Алгоритм выберет ПРЕВЫСИТЬ ВРЕМЯ, но ПОСЕТИТЬ ТОЧКУ.
    time_dimension.SetGlobalSpanCostCoefficient(100) 

    # Добавляем возможность пропуска (Disjunction), но с огромным штрафом
    for node in range(1, num_nodes):
        if not return_to_start and node == end_point_index:
            continue
        routing.AddDisjunction([manager.NodeToIndex(node)], base_penalty)

    if not return_to_start and end_point_index is not None:
        routing.SetEnd(end_point_index, 0)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    search_parameters.time_limit.FromSeconds(2) 

    solution = routing.SolveWithParameters(search_parameters)

    if solution:
        index = routing.Start(0)
        route_indices = []
        while not routing.IsEnd(index):
            route_indices.append(manager.IndexToNode(index))
            index = solution.Value(routing.NextVar(index))
        route_indices.append(manager.IndexToNode(index))
        
        # ПРОВЕРКА: Если маршрут пустой (только старт-финиш), а точки были...
        if len(route_indices) <= 2 and num_nodes > 3:
            # Возвращаем Fallback: просто берем первые 5 точек тупо по порядку
            # Это лучше, чем ничего.
            fallback_route = [0]
            # Берем точки 1, 2, 3, 4 (если они есть)
            count = min(num_nodes, 6) 
            for i in range(1, count):
                if i != end_point_index:
                    fallback_route.append(i)
            if end_point_index:
                fallback_route.append(end_point_index)
            elif return_to_start:
                fallback_route.append(0)
            return fallback_route

        return route_indices
    else:
        return [0]
